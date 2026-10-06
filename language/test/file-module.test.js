'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { createFileModule } = require('../runtime/native-modules/file');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-file-'));
try {
  const files = createFileModule({ baseDirectory: directory });
  assert.equal(files.exists('notes/message.txt'), false);
  assert.equal(files.write('notes/message.txt', 'one'), true);
  assert.equal(files.append('notes/message.txt', '\ntwo'), true);
  assert.equal(files.exists('notes/message.txt'), true);
  assert.equal(files.read('notes/message.txt'), 'one\ntwo');
  assert.throws(() => files.read(''), /непустой строкой/);

  const entryPath = path.join(directory, 'main.fable');
  const output = [];
  run(`
    import file
    file.write("save.txt", "score=12")
    string saved = file.read("save.txt")
    bool present = file.exists("save.txt")
    print(saved)
    print(present)
  `, (value) => output.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
  assert.deepEqual(output, ['score=12', 'true']);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('file module tests passed');
