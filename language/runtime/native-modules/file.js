'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require('node:crypto');

const RANSM_MAGIC = 'RANS#M1';

const FILE_MEMBERS = [
  { kind: 'function', name: 'read', parameters: ['path'], optionalParameters: ['protocol', 'password'], detail: 'Прочитать обычный или зашифрованный текстовый файл' },
  { kind: 'function', name: 'write', parameters: ['path', 'value'], optionalParameters: ['protocol', 'password'], detail: 'Записать обычный или зашифрованный текстовый файл' },
  { kind: 'function', name: 'append', parameters: ['path', 'value'], detail: 'Дополнить текстовый файл' },
  { kind: 'function', name: 'exists', parameters: ['path'], detail: 'Проверить существование файла' },
];

function createFileModule(options = {}) {
  const baseDirectory = path.resolve(options.baseDirectory || process.cwd());
  const fileSystem = options.fs || fs;

  const requireProtocol = (protocol) => {
    if (typeof protocol !== 'string' || protocol.toLowerCase() !== 'rans#m') throw new Error('Поддерживается только протокол шифрования "rans#m".');
  };

  const requirePassword = (password) => {
    if (typeof password !== 'string' || password.length < 8) throw new Error('Пароль RANS#M должен содержать не меньше 8 символов.');
    return password;
  };

  const encrypt = (value, password) => {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(requirePassword(password), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(RANSM_MAGIC, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const envelope = {
      version: 1,
      cipher: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    return `${RANSM_MAGIC}\n${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64')}`;
  };

  const decrypt = (contents, password) => {
    try {
      requirePassword(password);
      const [magic, encoded, ...extra] = contents.split(/\r?\n/);
      if (magic !== RANSM_MAGIC || !encoded || extra.length) throw new Error('Неверный формат.');
      const envelope = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (envelope.version !== 1 || envelope.cipher !== 'aes-256-gcm' || envelope.kdf !== 'scrypt') throw new Error('Неподдерживаемая версия.');
      const salt = Buffer.from(envelope.salt, 'base64');
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      const encrypted = Buffer.from(envelope.data, 'base64');
      if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error('Повреждён заголовок.');
      const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(RANSM_MAGIC, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error) {
      if (error.message?.startsWith('Пароль RANS#M')) throw error;
      throw new Error('Не удалось расшифровать RANS#M: неверный пароль или файл повреждён.');
    }
  };

  const resolvePath = (value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Путь должен быть непустой строкой.');
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDirectory, value);
  };

  return {
    read(filePath, protocol, password) {
      const contents = fileSystem.readFileSync(resolvePath(filePath), 'utf8');
      if (protocol === undefined) return contents;
      requireProtocol(protocol);
      return decrypt(contents, password);
    },
    write(filePath, value, protocol, password) {
      const target = resolvePath(filePath);
      fileSystem.mkdirSync(path.dirname(target), { recursive: true });
      if (protocol !== undefined) requireProtocol(protocol);
      fileSystem.writeFileSync(target, protocol === undefined ? String(value) : encrypt(value, password), 'utf8');
      return true;
    },
    append(filePath, value) {
      const target = resolvePath(filePath);
      fileSystem.mkdirSync(path.dirname(target), { recursive: true });
      fileSystem.appendFileSync(target, String(value), 'utf8');
      return true;
    },
    exists(filePath) {
      return fileSystem.existsSync(resolvePath(filePath));
    },
  };
}

module.exports = { FILE_MEMBERS, createFileModule };
