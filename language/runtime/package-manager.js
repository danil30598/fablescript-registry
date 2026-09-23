'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { parse, check } = require('./engine');

const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/danil30598/fablescript-registry/main/frameworks/index.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readProjectConfig(projectDir) {
  const filePath = path.join(projectDir, 'fable.json');
  return fs.existsSync(filePath) ? readJson(filePath) : {};
}

function packageRequest(specification) {
  const separator = specification.lastIndexOf('@');
  const name = separator > 0 ? specification.slice(0, separator) : specification;
  const requestedVersion = separator > 0 ? specification.slice(separator + 1) : null;
  if (!PACKAGE_NAME.test(name)) throw new Error('Имя пакета может содержать только латинские буквы, цифры и _.');
  if (requestedVersion !== null && !requestedVersion) throw new Error('После @ нужно указать версию пакета.');
  return { name, requestedVersion };
}

async function downloadJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Реестр ответил HTTP ${response.status}.`);
  return response.json();
}

async function downloadText(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Сервер пакета ответил HTTP ${response.status}.`);
  return response.text();
}

async function downloadBuffer(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Сервер пакета ответил HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function safeArchivePath(destination, entryName) {
  const normalized = entryName.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Недопустимый путь в архиве пакета: ${entryName}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..')) throw new Error(`Недопустимый путь в архиве пакета: ${entryName}`);
  const target = path.resolve(destination, ...parts);
  const root = path.resolve(destination);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`Недопустимый путь в архиве пакета: ${entryName}`);
  return target;
}

function extractZip(archive, destination) {
  if (!Buffer.isBuffer(archive) || archive.length < 22) throw new Error('Архив нативного пакета повреждён.');
  const minimumOffset = Math.max(0, archive.length - 65557);
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('Архив нативного пакета повреждён: не найден каталог ZIP.');

  const entryCount = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('Архив нативного пакета повреждён.');
    const flags = archive.readUInt16LE(centralOffset + 8);
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    if (flags & 1) throw new Error('Зашифрованные архивы пакетов не поддерживаются.');
    const entryName = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8');
    const target = safeArchivePath(destination, entryName);

    if (entryName.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Архив нативного пакета повреждён.');
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      const contents = method === 0
        ? compressed
        : method === 8 ? zlib.inflateRawSync(compressed) : null;
      if (!contents) throw new Error(`Метод сжатия ZIP ${method} не поддерживается.`);
      if (contents.length !== uncompressedSize) throw new Error(`Файл ${entryName} имеет неверный размер.`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

async function installPackage(specification, options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const config = readProjectConfig(projectDir);
  const registryUrl = options.registryUrl || config.registry || process.env.FABLE_REGISTRY_URL || DEFAULT_REGISTRY_URL;

  const { name, requestedVersion } = packageRequest(specification);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Для установки пакетов требуется Node.js 18 или новее.');
  const registry = await downloadJson(registryUrl, fetchImpl);
  if (registry.schemaVersion !== 1 || !registry.packages) throw new Error('Реестр имеет неподдерживаемый формат.');
  const packageRecord = registry.packages[name];
  if (!packageRecord) throw new Error(`Пакет «${name}» не найден в реестре.`);
  const version = requestedVersion || packageRecord.latest;
  const release = packageRecord.versions?.[version];
  if (!release) throw new Error(`Версия «${version}» пакета «${name}» не найдена.`);

  const modulesDir = path.resolve(options.modulesDir || path.join(projectDir, 'fable_modules'));
  const lockPath = path.resolve(options.lockPath || path.join(projectDir, 'fable.lock.json'));
  fs.mkdirSync(modulesDir, { recursive: true });

  if (release.kind === 'native') {
    const platformKey = `${options.platform || process.platform}-${options.arch || process.arch}`;
    const platformRelease = release.platforms?.[platformKey];
    if (!platformRelease) throw new Error(`Пакет «${name}» пока не поддерживает платформу ${platformKey}.`);
    if (!platformRelease.url || !platformRelease.sha256 || !platformRelease.entry?.host || !platformRelease.entry?.python) {
      throw new Error(`Запись нативного пакета «${name}» заполнена не полностью.`);
    }
    const sourceUrl = new URL(platformRelease.url, registryUrl).href;
    const archive = await downloadBuffer(sourceUrl, fetchImpl);
    const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
    if (actualHash.toLowerCase() !== String(platformRelease.sha256).toLowerCase()) {
      throw new Error(`Контрольная сумма пакета «${name}» не совпадает.`);
    }

    const nativeRoot = path.join(modulesDir, '.native');
    const packagePath = path.join(nativeRoot, name);
    const temporaryPath = path.join(nativeRoot, `.install-${name}-${crypto.randomUUID()}`);
    fs.mkdirSync(temporaryPath, { recursive: true });
    try {
      extractZip(archive, temporaryPath);
      const hostPath = safeArchivePath(temporaryPath, platformRelease.entry.host);
      const pythonPath = safeArchivePath(temporaryPath, platformRelease.entry.python);
      if (!fs.existsSync(hostPath) || !fs.existsSync(pythonPath)) throw new Error(`Архив пакета «${name}» не содержит графический движок.`);
      writeJsonAtomic(path.join(temporaryPath, 'fable-native.json'), {
        name,
        version,
        platform: platformKey,
        host: platformRelease.entry.host,
        python: platformRelease.entry.python,
      });
      if (fs.existsSync(packagePath)) fs.rmSync(packagePath, { recursive: true, force: true });
      fs.renameSync(temporaryPath, packagePath);
    } catch (error) {
      fs.rmSync(temporaryPath, { recursive: true, force: true });
      throw error;
    }

    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const lock = fs.existsSync(lockPath) ? readJson(lockPath) : { lockVersion: 1, packages: {} };
    lock.lockVersion = 1;
    lock.packages ||= {};
    lock.packages[name] = { version, kind: 'native', platform: platformKey, url: sourceUrl, sha256: actualHash };
    writeJsonAtomic(lockPath, lock);
    return { name, version, modulePath: packagePath, registryUrl, kind: 'native' };
  }

  if (!release.url || !release.sha256) throw new Error(`Запись пакета «${name}» не содержит URL или SHA-256.`);

  const sourceUrl = new URL(release.url, registryUrl).href;
  const source = await downloadText(sourceUrl, fetchImpl);
  const actualHash = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
  if (actualHash.toLowerCase() !== String(release.sha256).toLowerCase()) {
    throw new Error(`Контрольная сумма пакета «${name}» не совпадает.`);
  }
  check(parse(source));

  const modulePath = path.join(modulesDir, `${name}.fable`);
  fs.writeFileSync(modulePath, source, 'utf8');

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const lock = fs.existsSync(lockPath) ? readJson(lockPath) : { lockVersion: 1, packages: {} };
  lock.lockVersion = 1;
  lock.packages ||= {};
  lock.packages[name] = {
    version,
    url: sourceUrl,
    sha256: actualHash,
    file: path.relative(projectDir, modulePath).replace(/\\/g, '/'),
  };
  writeJsonAtomic(lockPath, lock);
  return { name, version, modulePath, registryUrl };
}

module.exports = { DEFAULT_REGISTRY_URL, extractZip, installPackage, packageRequest };
