const header = '../../../src/header';
const VERSIONS = {
    v0: Symbol('v0')
};

describe('Header index', function () {
    beforeEach(function () {
        mockery.registerMock('./v0.js', VERSIONS.v0);
    });
    it('should return an object with all available envelope version attached', function () {
        const index = require(`${header}/index.js`);
        expect(index.v0).to.equal(VERSIONS.v0);
    });
});
