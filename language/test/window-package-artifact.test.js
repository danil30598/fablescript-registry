'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
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
  const readPlatformArchive = (platformKey) => {
    const platformRelease = release.platforms[platformKey];
    assert.ok(platformRelease, `Missing ${platformKey} release`);
    const archiveName = path.basename(new URL(platformRelease.url, 'https://example.test/index.json').pathname);
    const localArchive = path.join(projectRoot, 'build', archiveName);
    const archivePath = fs.existsSync(localArchive)
      ? localArchive
      : path.join(projectRoot, '..', 'frameworks', 'window', archiveName);
    const archive = fs.readFileSync(archivePath);
    assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), platformRelease.sha256);
    return archive;
  };
  const windowsArchive = readPlatformArchive('win32-x64');
  const macArchive = readPlatformArchive('darwin-arm64');

  const projectDir = fs.mkdtempSync(path.join(__dirname, '.tmp-fablescript-window-package-'));
  try {
    fs.writeFileSync(path.join(projectDir, 'fable.json'), '{"name":"window-package-test"}\n', 'utf8');
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      async json() { return registry; },
      async arrayBuffer() { return windowsArchive; },
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

  const macProjectDir = fs.mkdtempSync(path.join(__dirname, '.tmp-fablescript-window-mac-package-'));
  try {
    fs.writeFileSync(path.join(macProjectDir, 'fable.json'), '{"name":"window-mac-package-test"}\n', 'utf8');
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async json() { return registry; },
      async arrayBuffer() { return macArchive; },
    });
    const installed = await installPackage('window', {
      projectDir: macProjectDir,
      registryUrl: 'https://example.test/index.json',
      fetchImpl,
      platform: 'darwin',
      arch: 'arm64',
    });
    const python = path.join(installed.modulePath, 'python-macos-arm64', 'bin', 'python3.13');
    assert.deepEqual([...fs.readFileSync(python).subarray(0, 4)], [0xcf, 0xfa, 0xed, 0xfe]);
    assert.ok(fs.existsSync(path.join(installed.modulePath, 'python-macos-arm64', 'lib', 'python3.13', 'site-packages', 'pygame', '__init__.py')));
  } finally {
    fs.rmSync(macProjectDir, { recursive: true, force: true });
  }
  console.log('window package artifact tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
