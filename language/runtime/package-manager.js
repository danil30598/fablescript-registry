'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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
  if (!release.url || !release.sha256) throw new Error(`Запись пакета «${name}» не содержит URL или SHA-256.`);

  const sourceUrl = new URL(release.url, registryUrl).href;
  const source = await downloadText(sourceUrl, fetchImpl);
  const actualHash = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
  if (actualHash.toLowerCase() !== String(release.sha256).toLowerCase()) {
    throw new Error(`Контрольная сумма пакета «${name}» не совпадает.`);
  }
  check(parse(source));

  const modulesDir = path.resolve(options.modulesDir || path.join(projectDir, 'fable_modules'));
  fs.mkdirSync(modulesDir, { recursive: true });
  const modulePath = path.join(modulesDir, `${name}.fable`);
  fs.writeFileSync(modulePath, source, 'utf8');

  const lockPath = path.resolve(options.lockPath || path.join(projectDir, 'fable.lock.json'));
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

module.exports = { DEFAULT_REGISTRY_URL, installPackage, packageRequest };
