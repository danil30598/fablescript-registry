'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { installPackage } = require('../runtime/package-manager');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const registryLocal = path.join(projectRoot, 'registry', 'index.json');
  const registryPath = fs.existsSync(registryLocal) ? registryLocal : path.join(projectRoot, '..', 'frameworks', 'index.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const version = registry.packages.window.latest;
  const release = registry.packages.window.versions[version];
  const archiveName = `window-runtime-${version}-win32-x64.zip`;
  const localArchive = path.join(projectRoot, 'build', archiveName);
  const archivePath = fs.existsSync(localArchive)
    ? localArchive
    : path.join(projectRoot, '..', 'frameworks', 'window', archiveName);
  const archive = fs.readFileSync(archivePath);
  assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), release.platforms['win32-x64'].sha256);

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-window-package-'));
  try {
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      async json() { return registry; },
      async arrayBuffer() { return archive; },
    });
    const installed = await installPackage('window', {
      projectDir,
      registryUrl: 'https://example.test/index.json',
      fetchImpl,
      platform: 'win32',
      arch: 'x64',
    });
    const python = path.join(installed.modulePath, 'python-win-x64', 'python.exe');
    const result = spawnSync(python, ['-c', 'import pygame; print(pygame.version.ver)'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2\.6\.1/);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
  console.log('window package artifact tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
