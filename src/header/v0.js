/**
 * @module HeaderV0 The header module is responsible for reading and producing header binary data that can be used within
 *  an envelope.
 */

// Constants
const SIZE_INT8 = 1,
    SIZE_INT16 = 2,
    SIZE_NAME = 255,
    ENCODING_TEXT = 'utf8';

/**
 * Creates a new object to manage header data. This object focuses on being able to read data quickly.
 * @param {Buffer} buffer A buffer to use as existing data.
 * @returns {object} An object which can be used to add or remove items from the header, and which
 *      has a toBuffer function to generate a Buffer representation of the header data. The header
 *      structure is defined as follows:
 *          1 byte          - count         - The number of header fields - 1 (i.e. 0 means 1 field)
 *          Fields
 *              1 byte      - length        - The length of the name in bytes
 *              N bytes     - name          - The UTF8 encoded name
 *              2 byte      - dataLength    - The length of the data
 *              N bytes     - value         - The UTF8 encoded value
 */
module.exports = function createHeader(buffer) {
    // Configure the required stores
    const miss = Object.create(null);
    const partial = Object.create(null);
    const hit = Object.create({ toBuffer });
    let partialIndex = 0,
        searchPosition = SIZE_INT8,
        searchComplete = false;

    // Get the number of entries defined in the supplied buffer
    const searchCount = buffer && buffer.length > 0 ?
        buffer.readUInt8(0) + 1 :
        0;

    // Create and return the proxy to manage to header
    const header = new Proxy(hit, {
        get,
        set,
        ownKeys,
        getOwnPropertyDescriptor
    });
    return header;

    function ownKeys() {
        if (!searchComplete) {
            // Force all partials to load, which will mean we have all field names
            search(-1);
        }
        const hitKeys = Reflect.ownKeys(hit);
        const partialKeys = Reflect.ownKeys(partial);
        const keySet = new Set([...hitKeys, ...partialKeys]);
        return [...keySet];
    }

    /**
     * Gets the property descriptor from hit if available. If not, all partials are loaded and the key is searched for in
     *  partials. If it is found the data is loaded and the hit value is returned.
     * @param {object} target The target object (not used)
     * @param {string} name The name of the property to get the descriptor for
     * @returns {object} The property descriptor, or undefined.
     */
    function getOwnPropertyDescriptor(target, name) {
        if (name in hit) {
            return Reflect.getOwnPropertyDescriptor(target, name);
        } else {
            if (!searchComplete) {
                // Force all partials to load, which will mean we have all field names
                search(-1);
            }
            if (name in partial) {
                const pos = partial[name];
                readData(name, pos);
                return Reflect.getOwnPropertyDescriptor(hit, name);
            } else {
                return undefined;
            }
        }
    }

    /**
     * Returns a header value, looking it up in the supplied buffer if it is not found.
     * @param {object} target The object the property is being fetched off of.
     * @param {string} name The name of the property being fetched.
     * @returns {string|undefined} The value of the header if it is defined, else undefined
     */
    function get(target, name) {
        if (name in hit) {
            return hit[name];
        } else if (name in miss) {
            return undefined;
        } else if (name in partial) {
            const pos = partial[name];
            return readData(name, pos);
        } else {
            return search(name);
        }
    }

    /**
     * Called to set a value on the header.
     * @param {object} target The targeted object of the property being set
     * @param {string} name The name of the header
     * @param {string|undefined} value The value of the header
     * @returns {boolean} true
     * @throws {Error} If value is not a string or undefined, if name is not a string or too large.
     */
    function set(target, name, value) {
        if (value === undefined) {
            delete target[name];
            delete partial[name];
        } else if (typeof value === 'string') {
            if (!name || typeof name !== 'string') {
                throw new Error(`header name MUST be a non-empty string. Got ${name && typeof name}`);
            }
            // Only do the byte check if we haven't added it before
            if (name in hit === false && Buffer.byteLength(name) - 1 > SIZE_NAME) {
                throw new Error(`Header name may not be longer than ${SIZE_NAME} bytes. Got ${Buffer.byteLength(name)}`);
            }
            target[name] = value;
        } else {
            throw new Error(`Header values MUST be undefined or string. Got ${value && typeof value}`);
        }
        return true;
    }

    /**
     * Searches through the field names (From the last searched) to find one that matches the supplied name.
     * @param {string} nameToFind The name of the field to search for
     * @returns {string|undefined} The string data if it is found, else undefined.
     */
    function search(nameToFind) {
        for (;partialIndex < searchCount; partialIndex++) {
            const nlen = buffer.readUInt8(searchPosition) + 1;
            searchPosition = searchPosition + SIZE_INT8;
            const nameData = buffer.slice(searchPosition, searchPosition + nlen);
            const name = nameData.toString(ENCODING_TEXT);
            searchPosition = searchPosition + nameData.length;
            const dlen = buffer.readUInt16BE(searchPosition) + 1;
            partial[name] = searchPosition; // We always store so we have the field names on hand for buffering
            if (name === nameToFind) {
                partialIndex++;
                searchPosition = searchPosition + SIZE_INT16;
                const res = readData(name, searchPosition, dlen);
                searchPosition = searchPosition + dlen;
                searchComplete = partialIndex === searchCount;
                return res;
            }
            // This should be the start of the data
            searchPosition = searchPosition + SIZE_INT16 + dlen;
        }
        miss[nameToFind] = undefined;
        searchComplete = true;
        return undefined;
    }

    /**
     * Reads the data out of the buffer at the specified position
     * @param {string} name The name of the field being read
     * @param {number} position The position to read the data at
     * @param {number} len The number of bytes to read
     * @returns {string} The UTF8 decoded string representation of the read data.
     */
    function readData(name, position, len) {
        if (!len) {
            len = buffer.readUInt16BE(position) + 1;
            position += SIZE_INT16;
        }
        const data = buffer.slice(position, position + len);
        const str = data.toString(ENCODING_TEXT);
        hit[name] = str;
        return str;
    }

    /**
     * Serializes the header information into a buffer.
     * @returns {Buffer} A buffer containing the serialized data
     */
    function toBuffer() {
        // Get the names of the header fields we are writing
        const fieldNames = determineFieldNames();

        // If we have no fields we return an empty buffer
        if (fieldNames.length === 0) {
            return Buffer.allocUnsafe(0);
        }

        // Generate the data for the fields
        const fields = fieldNames.map(createField);

        // Create the buffer
        const totalSize = fields.reduce((size, field) => size + field.length, 1);
        const buff = Buffer.allocUnsafe(totalSize);
        // Add the field count - 1
        buff.writeUInt8(fields.length - 1);
        // Write the fields and return the filled buffer
        fields.reduce((pos, field) => pos + field.copy(buff, pos), SIZE_INT8);
        return buff;

        /**
         * Creates the buffer data necessary for the specified field.
         * @param {string} name The name of the field to create the data for.
         * @returns {Buffer} A buffer filled with the serialized field information
         */
        function createField(name) {
            // Prepare the data
            name = Buffer.from(name, ENCODING_TEXT);
            const data = Buffer.from(header[name], ENCODING_TEXT);

            // Create the return buffer and copy the data
            const res = Buffer.allocUnsafe(SIZE_INT8 + SIZE_INT16 + name.length + data.length);
            res.writeUInt8(name.length - 1, 0);
            name.copy(res, SIZE_INT8);
            res.writeUInt16BE(data.length - 1, SIZE_INT8 + name.length);
            data.copy(res, SIZE_INT8 + SIZE_INT16 + name.length);
            return res;
        }

        /**
         * Gets a list of fields that should be written
         * @returns {array<string>} An array of names to be written into the header
         */
        function determineFieldNames() {
            const bfields = bufferFields();
            const fields = Object.keys(hit)
                .concat(bfields)
                .filter((e, i, a) => a.indexOf(e) === i);
            return fields;
        }

        /**
         * Gets all field names defined in the constructor buffer
         */
        function bufferFields() {
            if (!searchComplete) {
                search(-1); // This will force loads of all partials
            }
            return Object.keys(partial);
        }
    }
};
