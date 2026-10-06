'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE_MEMBERS = [
  { kind: 'function', name: 'read', parameters: ['path'], detail: 'Прочитать текстовый файл' },
  { kind: 'function', name: 'write', parameters: ['path', 'value'], detail: 'Записать текст в файл' },
  { kind: 'function', name: 'append', parameters: ['path', 'value'], detail: 'Дополнить текстовый файл' },
  { kind: 'function', name: 'exists', parameters: ['path'], detail: 'Проверить существование файла' },
];

function createFileModule(options = {}) {
  const baseDirectory = path.resolve(options.baseDirectory || process.cwd());
  const fileSystem = options.fs || fs;

  const resolvePath = (value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Путь должен быть непустой строкой.');
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDirectory, value);
  };

  return {
    read(filePath) {
      return fileSystem.readFileSync(resolvePath(filePath), 'utf8');
    },
    write(filePath, value) {
      const target = resolvePath(filePath);
      fileSystem.mkdirSync(path.dirname(target), { recursive: true });
      fileSystem.writeFileSync(target, String(value), 'utf8');
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
