'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildPortable, executableName, findNodeExecutable } = require('../runtime/builder');

assert.equal(executableName('My Game'), 'My-Game');
assert.throws(() => executableName('***'), /латинскую букву или цифру/);
assert.match(findNodeExecutable(), /node\.exe$/i);

if (process.platform === 'win32') {
  const projectDirectory = fs.mkdtempSync(path.join(__dirname, '.tmp-fablescript-build-'));
  try {
    fs.writeFileSync(path.join(projectDirectory, 'fable.json'), '{"name":"Portable Test"}\n', 'utf8');
    fs.writeFileSync(path.join(projectDirectory, 'checker.fable'), 'func answer() {\n  return "EXECUTED"\n}\n', 'utf8');
    fs.writeFileSync(path.join(projectDirectory, 'main.fable'), 'import file\nvar value = input("Value: ")\nfile.write("saved.txt", value)\nprint("PORTABLE_" + value)\nprint(execute("checker.fable", "answer"))\n', 'utf8');
    const result = buildPortable(path.join(projectDirectory, 'main.fable'));
    assert.equal(path.basename(result.executablePath), 'Portable-Test.exe');
    assert.equal(path.basename(result.launcherPath), 'Portable-Test.cmd');
    assert.equal(fs.existsSync(path.join(result.outputDirectory, 'app', 'runtime', 'native-modules', 'file.js')), true);
    assert.equal(fs.existsSync(path.join(result.outputDirectory, 'app', 'runtime', 'native-modules', 'json.js')), true);
    assert.equal(fs.existsSync(path.join(result.outputDirectory, 'app', 'runtime', 'native-modules', 'math.js')), true);
    assert.equal(fs.existsSync(path.join(result.outputDirectory, 'app', 'runtime', 'console-input.js')), true);
    const execution = spawnSync('cmd.exe', ['/d', '/c', result.launcherPath], { encoding: 'utf8', input: 'OK\n', windowsHide: true, timeout: 15000 });
    assert.equal(execution.status, 0, execution.error?.message || execution.stderr || `signal: ${execution.signal}`);
    assert.match(execution.stdout, /PORTABLE_OK/);
    assert.match(execution.stdout, /EXECUTED/);
    assert.equal(fs.readFileSync(path.join(result.outputDirectory, 'app', 'project', 'saved.txt'), 'utf8'), 'OK');
    const rebuilt = buildPortable(path.join(projectDirectory, 'main.fable'));
    assert.equal(rebuilt.executablePath, result.executablePath);
  } finally {
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
}

console.log('builder tests passed');
