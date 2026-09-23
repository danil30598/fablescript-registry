'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { installPackage } = require('../runtime/package-manager');

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const contents = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, nameBuffer);
    localOffset += local.length + nameBuffer.length + contents.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

async function main() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-package-test-'));
  try {
    const source = 'func hello(string name) {\nreturn "Hello, " + name\n}\n';
    const sha256 = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
    const windowArchive = storedZip({
      'window-host.py': '# host',
      'python-win-x64/pythonw.exe': 'fake executable',
    });
    const windowSha256 = crypto.createHash('sha256').update(windowArchive).digest('hex');
    const registry = {
      schemaVersion: 1,
      packages: {
        greetings: {
          latest: '1.0.0',
          versions: { '1.0.0': { url: './greetings.fable', sha256 } },
        },
        window: {
          latest: '1.0.0',
          versions: {
            '1.0.0': {
              kind: 'native',
              platforms: {
                'win32-x64': {
                  url: './window.zip',
                  sha256: windowSha256,
                  entry: { host: 'window-host.py', python: 'python-win-x64/pythonw.exe' },
                },
              },
            },
          },
        },
      },
    };
    const responses = new Map([
      ['https://example.test/index.json', { json: registry }],
      ['https://example.test/greetings.fable', { text: source }],
      ['https://example.test/window.zip', { buffer: windowArchive }],
    ]);
    const fetchImpl = async (url) => {
      const value = responses.get(String(url));
      return {
        ok: Boolean(value),
        status: value ? 200 : 404,
        async json() { return value.json; },
        async text() { return value.text; },
        async arrayBuffer() { return value.buffer; },
      };
    };

    const installed = await installPackage('greetings', {
      projectDir,
      registryUrl: 'https://example.test/index.json',
      fetchImpl,
    });
    assert.equal(installed.version, '1.0.0');
    assert.equal(fs.readFileSync(path.join(projectDir, 'fable_modules', 'greetings.fable'), 'utf8'), source);

    const mainPath = path.join(projectDir, 'main.fable');
    const output = [];
    run('import greetings\nprint(greetings.hello("Alex"))', (value) => output.push(value), {
      filePath: mainPath,
      loadModule: createModuleLoader(mainPath),
    });
    assert.deepEqual(output, ['Hello, Alex']);
    const lock = JSON.parse(fs.readFileSync(path.join(projectDir, 'fable.lock.json'), 'utf8'));
    assert.equal(lock.packages.greetings.sha256, sha256);

    const installedWindow = await installPackage('window', {
      projectDir,
      registryUrl: 'https://example.test/index.json',
      fetchImpl,
      platform: 'win32',
      arch: 'x64',
    });
    assert.equal(installedWindow.kind, 'native');
    assert.equal(fs.readFileSync(path.join(installedWindow.modulePath, 'window-host.py'), 'utf8'), '# host');
    const nativeManifest = JSON.parse(fs.readFileSync(path.join(installedWindow.modulePath, 'fable-native.json'), 'utf8'));
    assert.equal(nativeManifest.python, 'python-win-x64/pythonw.exe');
    const loadedWindow = createModuleLoader(mainPath)('window', mainPath);
    assert.equal(loadedWindow.nativeExports.isOpen(), false);

    await assert.rejects(
      installPackage('greetings@2.0.0', { projectDir, registryUrl: 'https://example.test/index.json', fetchImpl }),
      /Версия «2.0.0»/,
    );
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
  console.log('package manager tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
