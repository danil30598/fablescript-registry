'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { installPackage } = require('../runtime/package-manager');

async function main() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-package-test-'));
  try {
    const source = 'func hello(string name) {\nreturn "Hello, " + name\n}\n';
    const sha256 = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
    const registry = {
      schemaVersion: 1,
      packages: {
        greetings: {
          latest: '1.0.0',
          versions: { '1.0.0': { url: './greetings.fable', sha256 } },
        },
      },
    };
    const responses = new Map([
      ['https://example.test/index.json', { json: registry }],
      ['https://example.test/greetings.fable', { text: source }],
    ]);
    const fetchImpl = async (url) => {
      const value = responses.get(String(url));
      return {
        ok: Boolean(value),
        status: value ? 200 : 404,
        async json() { return value.json; },
        async text() { return value.text; },
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
