'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTimeModule } = require('../runtime/native-modules/time');
const { createModuleLoader } = require('../runtime/module-loader');
const { run } = require('../runtime/engine');

test('time module reports seconds and measures deltas', () => {
  let current = 1250;
  const waits = [];
  const time = createTimeModule({
    now: () => current,
    sleep: (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(time.now(), 1.25);
  current = 1750;
  assert.equal(time.delta(), 0.5);
  current = 2000;
  assert.equal(time.delta(), 0.25);
  time.sleep(0.125);
  assert.deepEqual(waits, [125]);
  assert.throws(() => time.sleep(-1), /неотрицательным/);
});

test('time is available as a built-in FableScript module', () => {
  const output = [];
  const filePath = __filename;
  run('import time\nprint(time.now() > 0)', (value) => output.push(value), {
    filePath,
    loadModule: createModuleLoader(filePath),
  });
  assert.deepEqual(output, ['true']);
});
