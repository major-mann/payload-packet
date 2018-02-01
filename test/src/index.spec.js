const src = '../../src';
const VERSIONS = {
    v0: Symbol('v0')
};

describe('Package index', function () {
    beforeEach(function () {
        mockery.registerMock('./v0', VERSIONS.v0);
    });
    it('should return an object with all available envelope version attached', function () {
        const index = require(`${src}/index.js`);
        expect(index.v0).to.equal(VERSIONS.v0);
    });
});
