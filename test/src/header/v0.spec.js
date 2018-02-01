const header = '../../../src/header';

describe('Header V0', function () {
    let createHeader, buffer;
    beforeEach(function () {
        createHeader = require(`${header}/v0.js`);

        (function initializeBuffer() {
            const name1 = Buffer.from('foo', 'utf8');
            const name2 = Buffer.from('bar', 'utf8');
            const value1 = Buffer.from('hello', 'utf8');
            const value2 = Buffer.from('world', 'utf8');

            const kv1Size = 1 + name1.length + 2 + value1.length;
            const kv2Size = 1 + name2.length + 2 + value2.length;

            buffer = Buffer.alloc(1 + kv1Size + kv2Size);
            // Note: We want count - 1 here
            buffer.writeUInt8(1, 0);

            let position = buffer.writeUInt8(name1.length - 1, 1);
            position += name1.copy(buffer, position);
            position = buffer.writeUInt16BE(value1.length - 1, position);
            position += value1.copy(buffer, position);

            position = buffer.writeUInt8(name2.length - 1, position);
            position += name2.copy(buffer, position);
            position = buffer.writeUInt16BE(value2.length - 1, position);
            value2.copy(buffer, position);

            const oslice = buffer.slice;
            buffer.slice = chai.spy(function (...args) {
                return oslice.call(buffer, ...args);
            });
        }());
    });

    it('should return an object', function () {
        expect(createHeader()).to.be.an('object');
    });
    it('should remove a property when it is set to undefined', function () {
        const header = createHeader(buffer);
        let keys = Object.keys(header);
        expect(keys.length).to.equal(2);
        expect(keys.includes('foo')).to.equal(true);
        expect(keys.includes('bar')).to.equal(true);
        header.foo = undefined;
        keys = Object.keys(header);
        expect(keys.length).to.equal(1);
        expect(keys.includes('foo')).to.equal(false);
        expect(keys.includes('bar')).to.equal(true);
    });
    it('should only allow strings as property names', function () {
        const header = createHeader();
        expect(() => header[Symbol('test')] = 'foo').to.throw(/name.*string/);
    });
    it('should only allow strings as values', function () {
        const header = createHeader();
        expect(() => header.foo = 123).to.throw(/value.*string/);
        expect(() => header.foo = {}).to.throw(/value.*string/);
        expect(() => header.foo = () => 0).to.throw(/value.*string/);
    });
    it('should have all fields passed in the buffer as properties on the object', function () {
        const header = createHeader(buffer);
        const keys = Object.keys(header);
        expect(keys.length).to.equal(2);
        expect(keys.includes('foo')).to.equal(true);
        expect(keys.includes('bar')).to.equal(true);
        expect(header.foo).to.equal('hello');
        expect(header.bar).to.equal('world');
        Object.keys(header); // For coverage
    });
    it('should only load a field from the buffer on demand', function () {
        const header = createHeader(buffer);
        expect(buffer.slice).not.to.have.been.called();
        expect(header.bar).to.equal('world');
        // 1 for name foo, 1 for name bar and 1 for bar value
        expect(buffer.slice).to.have.been.called.exactly(3);
    });
    it('should return the values from the header defined in the buffer', function () {
        const header = createHeader(buffer);
        expect(header.foo).to.equal('hello');
        expect(header.bar).to.equal('world');
    });
    it('should ensure missed searches are cached as well', function () {
        const header = createHeader(buffer);
        expect(header.noexist).to.equal(undefined);
        expect(buffer.slice).to.have.been.called.exactly(2);
        expect(header.noexist).to.equal(undefined);
        expect(buffer.slice).to.have.been.called.exactly(2);
    });
    it('should not allow an assigned header name to be longer than 256 bytes when utf8 encoded', function () {
        const shortEnough = Array(256)
            .fill('a')
            .join('');
        const tooLong = Array(257)
            .fill('a')
            .join('');
        const header = createHeader();
        expect(() => header[shortEnough] = 'foo').not.to.throw();
        expect(() => header[tooLong] = 'bar').to.throw(/long/);
    });

    describe('getOwnPropertyDescriptor', function () {
        it('should cause all field names to be read', function () {
            const header = createHeader(buffer);
            expect(buffer.slice).to.have.been.called.exactly(0);
            Object.getOwnPropertyDescriptor(header, 'noexist');
            expect(buffer.slice).to.have.been.called.exactly(2);
        });
        it('should return undefined for properties that don\'t exist', function () {
            const header = createHeader(buffer);
            expect(Object.getOwnPropertyDescriptor(header, 'noexist')).to.equal(undefined);
        });
    });

    describe('toBuffer', function () {
        it('should ensure all fields are loaded into the local cache', function () {
            const header = createHeader(buffer);
            expect(buffer.slice).to.have.been.called.exactly(0);
            header.toBuffer();
            expect(buffer.slice).to.have.been.called.exactly(4);
        });
        it('should not re-search if all fields are loaded into the local cache', function () {
            const header = createHeader(buffer);
            expect(header.foo).to.equal('hello');
            expect(header.bar).to.equal('world');
            expect(buffer.slice).to.have.been.called.exactly(4);
            header.toBuffer();
            expect(buffer.slice).to.have.been.called.exactly(4);
        });
        it('should write the number of header fields to the start of the buffer', function () {
            const header = createHeader();
            header.foo = 'bar';
            header.bar = 'baz';
            const buff = header.toBuffer();
            // Expect count - 1
            expect(buff.readUInt8(0)).to.equal(1);
        });
        it('should write all field names followed by their data in the buffer data', function () {
            const header = createHeader();
            header.foo = 'bar';
            const buff = header.toBuffer();
            expect(buff.length).to.equal(10);
            expect(buff.slice(2, 5).toString('utf8')).to.equal('foo');
            expect(buff.slice(7, 10).toString('utf8')).to.equal('bar');
        });
    });
});
