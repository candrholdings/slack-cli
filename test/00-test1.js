/*global describe, it, expect, jasmine*/

'use strict';

describe('test1 tests', function () {
	it('Basic synchronous true', function () {
		expect(true).toBe(true);
	});

	it('Basic asynchronous true', function (done) {
		expect(true).toBe(true);
		done();
	});
});