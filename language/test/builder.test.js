'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildPortable, executableName, findNodeExecutable } = require('../runtime/builder');

assert.equal(executableName('My Game'), 'My-Game');
assert.throws(() => executableName('***'), /латинскую букву или цифру/);
assert.match(findNodeExecutable(), /node\.exe$/i);

if (process.platform === 'win32') {
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-build-'));
  try {
    fs.writeFileSync(path.join(projectDirectory, 'fable.json'), '{"name":"Portable Test"}\n', 'utf8');
    fs.writeFileSync(path.join(projectDirectory, 'main.fable'), 'import file\nfile.write("saved.txt", "ok")\nprint("PORTABLE_OK")\n', 'utf8');
    const result = buildPortable(path.join(projectDirectory, 'main.fable'));
    assert.equal(path.basename(result.executablePath), 'Portable-Test.exe');
    assert.equal(path.basename(result.launcherPath), 'Portable-Test.cmd');
    assert.equal(fs.existsSync(path.join(result.outputDirectory, 'app', 'runtime', 'native-modules', 'file.js')), true);
    const execution = spawnSync('cmd.exe', ['/d', '/c', result.launcherPath], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(execution.status, 0, execution.error?.message || execution.stderr || `signal: ${execution.signal}`);
    assert.match(execution.stdout, /PORTABLE_OK/);
    assert.equal(fs.readFileSync(path.join(result.outputDirectory, 'app', 'project', 'saved.txt'), 'utf8'), 'ok');
    const rebuilt = buildPortable(path.join(projectDirectory, 'main.fable'));
    assert.equal(rebuilt.executablePath, result.executablePath);
  } finally {
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
}

console.log('builder tests passed');
