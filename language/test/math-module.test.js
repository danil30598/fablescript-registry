'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { createMathModule } = require('../runtime/native-modules/math');

const math = createMathModule();
assert.equal(math.abs(-4), 4);
assert.equal(math.min(2, 7), 2);
assert.equal(math.max(2, 7), 7);
assert.equal(math.round(2.6), 3);
assert.equal(math.floor(2.9), 2);
assert.equal(math.ceil(2.1), 3);
assert.equal(math.sqrt(81), 9);
assert.equal(math.pow(2, 5), 32);
assert.ok(Math.abs(math.sin(math.PI / 2) - 1) < 1e-12);
assert.throws(() => math.sqrt(-1), /отрицательного/);
assert.throws(() => math.abs('4'), /числом/);

const output = [];
const entryPath = path.join(__dirname, 'math-example.fable');
run(`
  import math
  float pi = math.PI
  float root = math.sqrt(81)
  int rounded = math.round(2.6)
  print(root)
  print(rounded)
  print(math.max(pi, 3))
`, (value) => output.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
assert.deepEqual(output.slice(0, 2), ['9', '3']);
assert.ok(Number(output[2]) > 3.14);

console.log('math module tests passed');
