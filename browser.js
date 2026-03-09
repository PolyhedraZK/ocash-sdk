// CJS shim for browserify compatibility.
// Bundlers that support the `exports` map (webpack, vite, rollup, esbuild)
// will use the exports map instead and never load this file.
'use strict';
module.exports = require('./dist/browser.cjs');
