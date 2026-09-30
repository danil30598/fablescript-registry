'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { createRandomModule } = require('../runtime/native-modules/random');

const predictable = createRandomModule({ random: () => 0.5 });
assert.equal(predictable.int(1, 3), 2);
assert.equal(predictable.float(10, 20), 15);
assert.equal(predictable.choice(['a', 'b', 'c']), 'b');
assert.equal(predictable.chance(0.6), true);
assert.equal(predictable.chance(0.4), false);

const seededA = createRandomModule();
const seededB = createRandomModule();
seededA.seed(12345);
seededB.seed(12345);
assert.deepEqual(
  [seededA.int(1, 100), seededA.int(1, 100), seededA.int(1, 100)],
  [seededB.int(1, 100), seededB.int(1, 100), seededB.int(1, 100)],
);

assert.throws(() => predictable.int(5, 1), /Минимум/);
assert.throws(() => predictable.choice([]), /непустой список/);
assert.throws(() => predictable.chance(2), /от 0 до 1/);

const output = [];
const entryPath = path.join(__dirname, 'random-example.fable');
run(`
  import random
  random.seed(42)
  int first = random.int(1, 100)
  float fraction = random.float(0, 1)
  bool possible = random.chance(0.5)
  random.seed(42)
  print(first == random.int(1, 100))
`, (value) => output.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
assert.deepEqual(output, ['true']);

console.log('random module tests passed');
