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

  const secret = '{"name":"Alex","score":42}';
  assert.equal(files.write('save.json', secret, 'rans#m', 'strong-password'), true);
  const encrypted = fs.readFileSync(path.join(directory, 'save.json'), 'utf8');
  assert.match(encrypted, /^RANS#M1\n/);
  assert.equal(encrypted.includes('Alex'), false);
  assert.equal(files.read('save.json', 'rans#m', 'strong-password'), secret);
  files.write('save-2.json', secret, 'rans#m', 'strong-password');
  assert.notEqual(fs.readFileSync(path.join(directory, 'save-2.json'), 'utf8'), encrypted);
  assert.throws(() => files.read('save.json', 'rans#m', 'wrong-password'), /неверный пароль или файл повреждён/);
  assert.throws(() => files.write('bad.txt', secret, 'made-up', 'strong-password'), /только протокол/);
  assert.throws(() => files.write('bad.txt', secret, 'rans#m', 'short'), /не меньше 8/);

  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  fs.writeFileSync(path.join(directory, 'tampered.json'), tampered, 'utf8');
  assert.throws(() => files.read('tampered.json', 'rans#m', 'strong-password'), /файл повреждён/);

  const entryPath = path.join(directory, 'main.fable');
  const output = [];
  run(`
    import file
    file.write("save.txt", "score=12")
    string saved = file.read("save.txt")
    bool present = file.exists("save.txt")
    file.write("protected.json", "secret data", "rans#m", "fable-secret")
    string protected = file.read("protected.json", "rans#m", "fable-secret")
    print(saved)
    print(present)
    print(protected)
  `, (value) => output.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
  assert.deepEqual(output, ['score=12', 'true', 'secret data']);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('file module tests passed');
