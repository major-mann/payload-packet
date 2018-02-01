const v0 = '../../../src/v0';
const header = '../../../src/header';

describe('v0 create envelope', function () {
    let createEnvelope, oFrom;
    beforeEach(function () {
        oFrom = Buffer.from;
        createEnvelope = require(`${v0}/index.js`);
    });
    afterEach(function () {
        Buffer.from = oFrom;
    });

    it('should return an object', function () {
        expect(createEnvelope()).to.be.an('object');
    });
    it('should not allow a version other than 0 in the buffer', function () {
        const versionFailChecks = [0b00010000, 0b01000000, 0b10010000, 0b10000000];
        const versionSuccessChecks = [0, 0b00001000, 0b00000001, 0b00000100];

        versionFailChecks.forEach(function ensureFailure(meta) {
            expect(() => createEnvelope(Buffer.from([meta]))).to.throw(/version.*0/);
        });

        versionSuccessChecks.forEach(function ensureFailure(meta) {
            // expect(() => createEnvelope(Buffer.from([meta]))).not.to.throw();
            createEnvelope(Buffer.from([meta, ...Array(20).fill(0)]));
        });
    });

    describe('version', function () {
        it('should be equal to 0', function () {
            const envelope = createEnvelope();
            expect(envelope.version).to.equal(0);
        });
        it('should be read only', function () {
            const envelope = createEnvelope();
            expect(envelope.version).to.equal(0);
            envelope.version = 1;
            expect(envelope.version).to.equal(0);
        });
    });

    describe('contextId', function () {
        let envelope, buffer;
        beforeEach(function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
        });
        it('should return undefined if the meta data indicates there is no context', function () {
            expect(envelope.contextId).to.equal(undefined);
        });
        it('should return a buffer of exactly 4 bytes when there is a context', function () {
            buffer = initializeBuffer(0b00000100);
            envelope = createEnvelope(buffer);
            const contextId = envelope.contextId;
            expect(contextId instanceof Buffer).to.equal(true);
        });
        it('should allow a buffer to be set directly', function () {
            const buff = Buffer.from([1, 2, 3, 4]);
            const envelope = createEnvelope();
            envelope.contextId = buff;
            expect(envelope.contextId).to.equal(buff);
        });
        it('should only allow values which can be automatically turned into buffers', function () {
            expect(() => envelope.contextId = 123).to.throw(/buffer/i);
        });
        it('should pass the error along from buffer creation if Buffer.from raises an non TypeError', function () {
            const err = new Error('fake');
            const typeErr = new Error('fake');
            Buffer.from = createThrower(err);

            doErrorCheck(err, true, () => envelope.contextId = 'foob');
            doErrorCheck(typeErr, false, () => envelope.contextId = 'foob');

            /** Creates a function thaty will throw the specified error */
            function createThrower(err) {
                return function thrower() {
                    throw err;
                };
            }

            /**
             * Checks that an error is thrown from the supplied handler, and whether it is
             *  equal to the supplied error or not.
             */
            function doErrorCheck(err, equal, handler) {
                try {
                    handler();
                } catch (ex) {
                    if (equal) {
                        expect(ex).to.equal(err);
                    } else {
                        expect(ex).not.to.equal(err);
                    }
                }
            }
        });
        it('should ensure the final buffer data is exactly 4 bytes long', function () {
            expect(() => envelope.contextId = 'abcde').to.throw(/4.*bytes/);
            expect(() => envelope.contextId = '☺☺☺☺').to.throw(/4.*bytes/);
        });
        it('should only read from the buffer once', function () {
            buffer = initializeBuffer(0b00000100);
            envelope = createEnvelope(buffer);
            expect(buffer.slice).to.have.been.called.exactly(1);
            let contextId = envelope.contextId;
            expect(contextId.length).to.equal(4);
            expect(buffer.slice).to.have.been.called.exactly(2);
            contextId = envelope.contextId;
            expect(contextId.length).to.equal(4);
            expect(buffer.slice).to.have.been.called.exactly(2);
        });
    });

    describe('subSource', function () {
        let envelope, buffer;
        beforeEach(function () {
            buffer = initializeBuffer(0b00000110);
            envelope = createEnvelope(buffer);
        });
        it('should return undefined if the meta indicates there is no sub context', function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
            expect(envelope.subSource).to.equal(undefined);
        });
        it('should only read the data from the buffer once', function () {
            expect(buffer.readUInt8).to.have.been.called.exactly(1);
            expect(envelope.subSource).to.equal(false);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
            expect(envelope.subSource).to.equal(false);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
        });
        it('should set subId to undefined if it is set to undefined', function () {
            expect(envelope.subId).to.equal(0);
            envelope.subSource = undefined;
            expect(envelope.subId).to.equal(undefined);
        });
        it('should set subId to 0 if it is changed from undefined', function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
            expect(envelope.subId).to.equal(undefined);
            envelope.subSource = false;
            expect(envelope.subId).to.equal(0);
        });
        it('should convert to boolean', function () {
            envelope = createEnvelope();
            envelope.subId = 1; // For coverage
            envelope.subSource = 'foobarbaz';
            expect(envelope.subSource).to.equal(true);
        });
    });

    describe('subId', function () {
        let buffer, envelope;
        beforeEach(function () {
            buffer = initializeBuffer(0b00000110);
            envelope = createEnvelope(buffer);
        });
        it('should return undefined if the meta indicates there is no sub context', function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
            expect(envelope.subId).to.equal(undefined);
        });
        it('should only read the data from the buffer once', function () {
            expect(buffer.readUInt8).to.have.been.called.exactly(1);
            expect(envelope.subId).to.equal(0);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
            expect(envelope.subId).to.equal(0);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
        });
        it('should set subSource to undefined if it is set to undefined', function () {
            expect(envelope.subSource).to.equal(false);
            envelope.subId = undefined;
            expect(envelope.subSource).to.equal(undefined);
        });
        it('should ensure the id value is not less than 0', function () {
            expect(() => envelope.subId = 0).not.to.throw();
            expect(() => envelope.subId = -1).to.throw(/\b0\b/);
            expect(() => envelope.subId = 0).not.to.throw(); // Twice for coverage
        });
        it('should ensure the id value is not larger than 127', function () {
            expect(() => envelope.subId = 128).to.throw(/\b127\b/);
            expect(() => envelope.subId = 127).not.to.throw();
        });
        it('should default subSource to false if changed from undefined', function () {
            const envelope = createEnvelope();
            expect(envelope.subId).to.equal(undefined);
            expect(envelope.subSource).to.equal(undefined);
            envelope.subId = 0;
            expect(envelope.subSource).to.equal(false);
        });
    });

    describe('protocolCommand', function () {
        let buffer, envelope;
        beforeEach(function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
        });
        it('should only read the data from the buffer once', function () {
            expect(buffer.readUInt8).to.have.been.called.exactly(1);
            expect(envelope.protocolCommand).to.equal(false);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
            expect(envelope.protocolCommand).to.equal(false);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
        });
        it('should default to false when there is no buffer data', function () {
            envelope = createEnvelope();
            expect(envelope.protocolCommand).to.equal(false);
        });
        it('should convert to boolean', function () {
            envelope = createEnvelope();
            envelope.protocolCommand = 'foo';
            expect(envelope.protocolCommand).to.equal(true);
        });
    });

    describe('command', function () {
        let buffer, envelope;
        beforeEach(function () {
            buffer = initializeBuffer(0);
            envelope = createEnvelope(buffer);
        });
        it('should only read the data from the buffer once', function () {
            expect(buffer.readUInt8).to.have.been.called.exactly(1);
            expect(envelope.command).to.equal(0);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
            expect(envelope.command).to.equal(0);
            expect(buffer.readUInt8).to.have.been.called.exactly(2);
        });
        it('should ensure the command value is not less than 0', function () {
            // Next 2 lines for coverage
            envelope.protocolCommand = false;
            envelope.command = 123;

            // Actual test
            expect(() => envelope.command = -1).to.throw(/\b0\b/);
            expect(() => envelope.command = 0).not.to.throw();
        });
        it('should ensure the command value is not larger than 127', function () {
            expect(() => envelope.command = 128).to.throw(/\b127\b/);
            expect(() => envelope.command = 127).not.to.throw();
        });
    });

    describe('header', function () {
        let createHeader;
        beforeEach(function () {
            createHeader = require(`${header}/v0.js`);
        });
        it('should populate the with data passed in the buffer', function () {
            const header = createHeader();
            header.foo = 'bar';
            const headerBuff = header.toBuffer();
            const buffer = initializeBuffer(0b00000001);
            buffer.writeUInt16BE(headerBuff.length, 2);
            headerBuff.copy(buffer, 4);
            const envelope = createEnvelope(buffer);
            expect(envelope.header).to.be.an('object');
            expect(envelope.header.foo).to.equal('bar');
        });
        it('should be read only', function () {
            const envelope = createEnvelope();
            const orig = envelope.header;
            expect(envelope.header).to.be.an('object');
            envelope.heaader = 123;
            expect(envelope.header).to.equal(orig);
        });
    });

    describe('payload', function () {
        it('should return a buffer if meta type is 0', function () {
            const buffer = initializeBuffer(0b00000000);
            const envelope = createEnvelope(buffer);
            const payload = envelope.payload;
            expect(payload instanceof Buffer).to.equal(true);
        });
        it('should parse the buffer as a JSON string if meta type is 1', function () {
            const payloadData = Buffer.from(JSON.stringify({ foo: 'bar' }));
            let buffer = initializeBuffer(0b00001000);
            payloadData.copy(buffer, 2);
            buffer = buffer.slice(0, payloadData.length + 2);
            const envelope = createEnvelope(buffer);
            expect(envelope.payload).to.be.an('object');
            expect(envelope.payload.foo).to.equal('bar');
        });
        it('should return undefined if the meta type is 1 and the payload buffer length is 0', function () {
            const buffer = Buffer.from([0b00001000, 0]);
            const envelope = createEnvelope(buffer);
            expect(envelope.payload).to.equal(undefined);
        });
        it('Throw a descriptive exception if the JSON is malformed', function () {
            const invalidData = Buffer.from('foobar', 'utf8');
            const buffer = initializeBuffer(0b00001000, 1 + invalidData.length);
            invalidData.copy(buffer, 2);
            const envelope = createEnvelope(buffer);
            expect(() => envelope.payload).to.throw(/json.*foobar/i);
        });
    });

    describe('toBuffer', function () {
        it('should indicate a version of 0', function () {
            const envelope = createEnvelope();
            expect(envelope.version).to.equal(0);
        });
        it('should indicate a type of 0 if a buffer is supplied for payload', function () {
            const envelope = createEnvelope();
            envelope.payload = Buffer.from([0]);
            const data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0);
        });
        it('should indicate a type of 1 if a non buffer is supplied for payload', function () {
            const envelope = createEnvelope();
            envelope.subSource = true; // For coverage
            envelope.payload = {};
            const data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00001110);
        });
        it('should indicate true in the meta for context when a contextId has been set', function () {
            const envelope = createEnvelope();
            envelope.contextId = 'foob';
            const data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00000100);
        });
        it('should indicate true in the meta for sub context when a subId has been set', function () {
            const envelope = createEnvelope();
            envelope.contextId = 'foob';
            envelope.subId = 0;
            const data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00000110);
        });
        it('should remove the contextId if it is sey to undefined', function () {
            const envelope = createEnvelope();
            envelope.contextId = 'foob';
            let data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00000100);
            envelope.contextId = undefined;
            data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00000000);
        });
        it('should indicate true in the meta for header when the header has any fields attached', function () {
            const envelope = createEnvelope();
            envelope.header.foo = 'bar';
            const data = envelope.toBuffer();
            expect(data.readUInt8()).to.equal(0b00000001);
        });
        it('should write the protocolCommand and command fields to a single byte', function () {
            const envelope = createEnvelope();
            envelope.command = 0b00011011;
            let data = envelope.toBuffer();
            expect(data.readUInt8(1)).to.equal(0b00011011);
            envelope.protocolCommand = true;
            data = envelope.toBuffer();
            expect(data.readUInt8(1)).to.equal(0b10011011);

        });
        it('should write the 4 bytes of context information when it is not undefined', function () {
            const envelope = createEnvelope();
            envelope.contextId = 'foob';
            const data = envelope.toBuffer();
            expect(data.slice(2, 6).toString('utf8')).to.equal('foob');
        });
        it('should write 1 byte of sub context information when it is not undefined', function () {
            const envelope = createEnvelope();
            envelope.contextId = 'foob';
            envelope.subId = 123;
            const data = envelope.toBuffer();
            expect(data.readUInt8(6)).to.equal(123);
        });
        it('should write the size of the header in bytes as an unsigned int16 if there is at least 1 header field', function () {
            const envelope = createEnvelope();
            envelope.header.foo = 'bar';
            const data = envelope.toBuffer();
            // Count - 1
            expect(data.readUInt16BE(2)).to.be.above(0);
        });
        it('should write 0 bytes for payload if it is undefined', function () {
            const envelope = createEnvelope();
            envelope.payload = undefined;
            const data = envelope.toBuffer();
            expect(data.length).to.equal(2);
        });
    });

    function initializeBuffer(meta, len) {
        len = parseInt(len, 10);
        if (isNaN(len)) {
            len = 20;
        }
        const buffer = Buffer.from([meta, ...Array(len).fill(0)]);
        const oslice = buffer.slice;
        const oReadUInt8 = buffer.readUInt8;
        buffer.slice = chai.spy(function (...args) {
            return oslice.call(buffer, ...args);
        });
        buffer.readUInt8 = chai.spy(function (...args) {
            return oReadUInt8.call(buffer, ...args);
        });
        return buffer;
    }

});
