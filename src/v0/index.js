/**
 * @module Version0 This represents the envelope structure for V0 of the [A]dvanced [R]equest [R]esponse protocol
 * The envelope structure is defined as follows:
 *  4bits   - version               - The envelope version. MUST be 0
 *  1bit    - type                  - Whether the payload data is a raw buffer (0) or JSON data (1)
 *  1bit    - context               - Whether this envelope contains data for a specific context
 *  1bit    - subContext            - Whether this envelope contains data for a sub context
 *  1bit    - hasHeader             - Whether the command has header data
 *  ------------------------------------
 *  1bit    - protocolCommand       - Whether the command value is a protocol command (0) or user command (1)
 *  7bit    - command               - The command id to execute
 *  ------------------------------------
 *  4bytes  - contextId             - The unique id of the request. Only defined if context is true
 *  ------------------------------------
 *  1bit    - sub.source            - Whether the dynamic context id was defined by the creator of the envelope. This is only
 *                                      defined if subContext is true.
 *  7bits   - sub.id                - The id of the sub context. This is only defined if subContext is true.
 *  ------------------------------------
 *  2bytes - [headerSize]
 *  ------------------------------------
 *  nbytes - [header]               - The header data
 *  ------------------------------------
 *  nbytes  - payload               - The payload data
 *  Note: The minumum envelope overhead is 7 bytes, whereas the maximum overhead is 11 bytes.
 */

// Constants
const EMPTY = Symbol('empty');
const MASK = {
    VERSION: 0b11110000,
    TYPE: 0b00001000,
    CONTEXT: 0b00000100,
    SUB_CONTEXT: 0b00000010,
    SUB_CONTEXT_SOURCE: 0b10000000,
    SUB_CONTEXT_ID: 0b01111111,
    HEADER: 0b00000001,
    COMMAND_PROTOCOL: 0b10000000,
    COMMAND: 0b01111111
};
const OFFSET_VERSION = 4;
const POSITION = {
    //Note: Fixed positions only
    META: 0,
    COMMAND: 1,
    CONTEXT: 2,
    SUB_CONTEXT: 6
};
const SIZE = {
    META: 1,
    COMMAND: 1,
    CONTEXT: 4,
    SUB_CONTEXT: 1,
    HEADER: 2,
    INT16: 2
};
const ENCODING_TEXT = 'utf8';
const MAX_7BIT = Math.pow(2, 7); // eslint-disable-line no-magic-numbers

// Dependencies
const createHeader = require('../header').v0;

/**
 * Creates a new envelope object
 * @param {Buffer} buffer Data to create the envelope with (Will only be read on demand)
 * @returns {object} The envelope which be transformed into a buffer and sent
 *                  * {number}  version The envelope version
 *                  * {Buffer}  contextId The contextId. Undefined for none
 *                  * {boolean} subSource Whether the sub id is from the request (true) or the response (false)
 *                  * {number}  subId The sub context id. undefined if this is targeted at a sub context
 *                  * {boolean} protocolCommand Whether the command is a protocol command or not
 *                  * {number}  command The command number
 *                  * {object}  header The header object (No key value pairs will result in no header being set)
 *                  * {*} payload The payload data
 */
module.exports = function createEnvelope(buffer) {
    let meta, envelope, envelopeHeader, envelopePayload;

    // Prepare the initial data
    if (buffer && buffer.length) {
        processReceivedBuffer();
    } else {
        meta = 0;
        envelopeHeader = createHeader();
        envelopePayload = Buffer.alloc(0);
        buffer = Buffer.alloc(0);
    }

    const cache = { };
    return envelope = {
        /**
         * Fetches the envelope version
         * @returns {number} 0
         */
        get version() {
            return 0;
        },

        /**
         * Fetches the contextId or undefined if there is none.
         * @returns {Buffer} A 4 byte buffer containing the context id
         */
        get contextId() {
            if (cache.contextId === undefined) {
                if (meta & MASK.CONTEXT) {
                    cache.contextId = buffer.slice(POSITION.CONTEXT, POSITION.CONTEXT + SIZE.CONTEXT);
                } else {
                    cache.contextId = EMPTY;
                }
            }
            if (cache.contextId === EMPTY) {
                return undefined;
            } else {
                return cache.contextId;
            }
        },

        /**
         * Sets the contextId.
         * @param {string|Buffer} value A string (will be encoded with UTF8) or buffer representing the contextId
         * @throws {Error} When contextId is not exactly 4 bytes
         */
        set contextId(value) {
            if (value === undefined) {
                // Turn off sub context
                cache.contextId = EMPTY;
                cache.subSource = EMPTY;
                cache.subId = EMPTY;
            } else {
                if (value instanceof Buffer === false) {
                    try {
                        value = Buffer.from(value, ENCODING_TEXT);
                    } catch (ex) {
                        if (ex && ex.constructor && ex.constructor.name === 'TypeError') {
                            throw new Error(`Unable to create a buffer from the supplied value. Value: ${value}. ` +
                                `Error ${ex.message}`);
                        } else {
                            throw ex;
                        }
                    }
                }
                if (value.length !== SIZE.CONTEXT) {
                    throw new Error(`contextId MUST be exactly ${SIZE.CONTEXT} bytes in size. Got ${value.length} bytes`);
                }
                cache.contextId = value;
            }
        },

        /**
         * Gets whether the sub context id is from the source (true - requester) or destination (false - responder)
         */
        get subSource() {
            if (cache.subSource === undefined) {
                readSub();
            }
            if (cache.subSource === EMPTY) {
                return undefined;
            } else {
                return cache.subSource;
            }
        },
        /** Sets whether the sub context id is from the source (true - requester) or destination (false - responder) */
        set subSource(value) {
            if (value === undefined) {
                cache.subSource = EMPTY;
                cache.subId = EMPTY;
            } else {
                value = !!value;
                cache.subSource = value;
                if (cache.subId === undefined || cache.subId === EMPTY) {
                    cache.subId = 0;
                }
                if (envelope.contextId === undefined) {
                    initializeEmptyContext();
                }
            }
        },

        /** Gets the sub context id */
        get subId() {
            if (cache.subId === undefined) {
                readSub();
            }
            if (cache.subId === EMPTY) {
                return undefined;
            } else {
                return cache.subId;
            }
        },
        /**
         * Sets the sub context id.
         * @param {undefined|number} value The id. Set to undefined to indicate that the envelope does not represent a
         *  sub context.
         * @throws {RangeError} If value is less than 0 or greater than 127
         */
        set subId(value) {
            if (value === undefined) {
                cache.subSource = EMPTY;
                cache.subId = EMPTY;
            } else if (value >= 0 && value < MAX_7BIT) {
                cache.subId = value;
                if (cache.subSource === undefined || cache.subSource === EMPTY) {
                    cache.subSource = false;
                }
                if (envelope.contextId === undefined) {
                    initializeEmptyContext();
                }
            } else {
                throw new RangeError(`value MUST be between 0 and ${MAX_7BIT - 1} (inclusive). Got ${value}`);
            }
        },

        /**
         * Gets whether the command data is a protocol command or a user command
         * @returns {boolean} true if the command is a protocol command, false of not
         */
        get protocolCommand() {
            if (cache.protocolCommand === undefined) {
                readCommand();
            }
            return cache.protocolCommand;
        },
        /**
         * Sets whether the command data is targeted at the protocol
         * @param {boolean} value truthy if the command is targeted at the protocol, else false
         */
        set protocolCommand(value) {
            cache.protocolCommand = !!value;
            if (cache.command === undefined) {
                cache.command = 0;
            }
        },

        /** Gets the command number */
        get command() {
            if (cache.command === undefined) {
                readCommand();
            }
            return cache.command;
        },
        /** Sets the comman number */
        set command(value) {
            if (value >= 0 && value < MAX_7BIT) {
                cache.command = value;
                if (cache.protocolCommand === undefined) {
                    cache.protocolCommand = false;
                }
            } else {
                throw new RangeError(`value MUST be between 0 and ${MAX_7BIT - 1} (inclusive). Got ${value}`);
            }
        },
        /** Returns the header object */
        get header() {
            return envelopeHeader;
        },
        /** Returns the payload */
        get payload() {
            if (cache.payload === undefined) {
                if ((meta & MASK.TYPE) === 0) {
                    cache.payload = envelopePayload;
                } else if (envelopePayload.length) {
                    const str = envelopePayload.toString(ENCODING_TEXT);
                    try {
                        cache.payload = JSON.parse(str);
                    } catch (ex) {
                        throw new Error(`Unable to parse received payload content as JSON! ${ex.message}. Content: ${str}`);
                    }
                } else {
                    cache.payload = EMPTY;
                }
            }
            if (cache.payload === EMPTY) {
                return undefined;
            } else {
                return cache.payload;
            }
        },
        /** Updates the payload */
        set payload(value) {
            if (value === undefined) {
                cache.payload = EMPTY;
            } else {
                cache.payload = value;
            }
        },
        toBuffer
    };

    /** Initializes the data for the received buffer */
    function processReceivedBuffer() {
        meta = buffer.readUInt8(0);
        if ((meta & MASK.VERSION) !== 0) {
            throw new Error(`Supplied buffer has version ${(meta & MASK.VERSION) >> OFFSET_VERSION}. Expected to be 0`);
        }
        let position = SIZE.META + SIZE.COMMAND;
        if (meta & MASK.CONTEXT) {
            position += SIZE.CONTEXT;
        }
        if (meta & MASK.SUB_CONTEXT) {
            position += SIZE.SUB_CONTEXT;
        }
        if (meta & MASK.HEADER) {
            const headerSize = buffer.readUInt16BE(position);
            position = position + SIZE.INT16;
            const headerEnd = position + headerSize;
            const header = buffer.slice(position, headerEnd);
            envelopeHeader = createHeader(header);
            envelopePayload = buffer.slice(headerEnd);
        } else {
            envelopeHeader = createHeader();
            envelopePayload = buffer.slice(position);
        }
    }

    /** Reads the sub pair from the buffer if the buffer is marked as containing it */
    function readSub() {
        if (meta & MASK.SUB_CONTEXT) {
            const subData = buffer.readUInt8(POSITION.SUB_CONTEXT);
            cache.subSource = !!(subData & MASK.SUB_CONTEXT_SOURCE);
            cache.subId = subData & MASK.SUB_CONTEXT_ID;
        } else {
            cache.subSource = EMPTY;
            cache.subId = EMPTY;
        }
    }

    /** Reads a command pair from the buffer */
    function readCommand() {
        const commandData = buffer.length > 0 && buffer.readUInt8(POSITION.COMMAND) || 0;
        cache.protocolCommand = !!(commandData & MASK.COMMAND_PROTOCOL);
        cache.command = commandData & MASK.COMMAND;
    }

    /** Serializes the envelope data into a buffer */
    function toBuffer() {
        let command, position;
        // Note: use the proto in case we have a header field called "toBuffer"
        const header = Object.getPrototypeOf(envelope.header).toBuffer();
        const meta = createMeta(header.length);
        const payload = createPayload(envelope.payload);
        const bufferSize = calculateSize();
        const buffer = Buffer.allocUnsafe(bufferSize);

        writeMetaAndCommand();
        writeContext();
        writeHeaderAndPayload();

        return buffer;

        /** Writes the meta and command bytes */
        function writeMetaAndCommand() {
            buffer.writeUInt8(meta, POSITION.META);
            buffer.writeUInt8(command, POSITION.COMMAND);
            position = POSITION.COMMAND + SIZE.COMMAND;
        }

        /** Writes the context information to the buffer */
        function writeContext() {
            if (envelope.contextId !== undefined) {
                envelope.contextId.copy(buffer, POSITION.CONTEXT);
                position = POSITION.CONTEXT + SIZE.CONTEXT;

                // Note: We can only write a subSource if we have a context. Although, the setters should handle that
                //  situation, we make sure the logic matches here.
                if (envelope.subSource !== undefined) {
                    const sub = createSub();
                    buffer.writeUInt8(sub, POSITION.SUB_CONTEXT);
                    position = POSITION.SUB_CONTEXT + SIZE.SUB_CONTEXT;
                }
            }
        }

        /** Copies the header data in (If any header fields are defined) and writes the payload data in after */
        function writeHeaderAndPayload() {
            if (header.length) {
                buffer.writeUInt16BE(header.length, position);
                position = position + SIZE.INT16;
                position = position + header.copy(buffer, position);
            }
            payload.copy(buffer, position);
        }

        /** Creates the meta byte. */
        function createMeta() {
            let meta = 0;
            if (envelope.payload instanceof Buffer === false) {
                meta = meta | MASK.TYPE;
            }
            if (envelope.contextId !== undefined) {
                meta = meta | MASK.CONTEXT;
            }
            if (envelope.subSource !== undefined) {
                meta = meta | MASK.SUB_CONTEXT;
            }
            if (header.length) {
                meta = meta | MASK.HEADER;
            }
            command = envelope.command;
            if (envelope.protocolCommand) {
                command = command | MASK.COMMAND_PROTOCOL;
            }
            if (envelope.subSource !== undefined) {
                meta = meta | MASK.SUB_CONTEXT;
            }
            return meta;
        }

        /** Creates the sub byte */
        function createSub() {
            let sub = envelope.subId;
            if (envelope.subSource === true) {
                sub = sub | MASK.SUB_CONTEXT_SOURCE;
            }
            return sub;
        }

        /**
         * Ensures the supplied data is represented as a Buffer.
         * @param {*} data The payload data
         * @returns {Buffer} A buffer representing the data
         */
        function createPayload(data) {
            if (data instanceof Buffer) {
                return data;
            }
            if (data === undefined) {
                return Buffer.allocUnsafe(0);
            }
            const str = JSON.stringify(data);
            return Buffer.from(str, ENCODING_TEXT);
        }

        /** Determines the required size of the buffer being constructed */
        function calculateSize() {
            let size = SIZE.META + SIZE.COMMAND + payload.length;
            if (envelope.contextId !== undefined) {
                size = size + SIZE.CONTEXT;
            }
            if (envelope.subSource !== undefined) {
                size = size + SIZE.SUB_CONTEXT;
            }
            if (header.length) {
                size = size + SIZE.HEADER + header.length;
            }
            return size;
        }
    }

    /** A global point for initializing the contextId with empty data in case we want to change the default */
    function initializeEmptyContext() {
        envelope.contextId = Buffer.from([0, 0, 0, 0]);
    }
};
