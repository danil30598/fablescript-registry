'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function findConfiguredProjectDir(startDirectory) {
  let directory = path.resolve(startDirectory);
  while (true) {
    if (fs.existsSync(path.join(directory, 'fable.json'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function globalModulesDir() {
  const fableHome = process.env.FABLE_HOME
    ? path.resolve(process.env.FABLE_HOME)
    : path.join(os.homedir(), '.fable');
  return path.join(fableHome, 'packages');
}

function findProjectDir(filePath) {
  const fallback = path.dirname(path.resolve(filePath));
  return findConfiguredProjectDir(fallback) || fallback;
}

function createModuleLoader(entryFilePath) {
  const projectDir = findProjectDir(entryFilePath);
  return (name, importerPath) => {
    const candidates = [
      path.resolve(path.dirname(importerPath), `${name}.fable`),
      path.resolve(projectDir, 'fable_modules', `${name}.fable`),
      path.resolve(globalModulesDir(), `${name}.fable`),
    ];
    const modulePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!modulePath) {
      throw new Error(`файл ${name}.fable не найден рядом с программой, в fable_modules или среди глобальных пакетов`);
    }
    return { source: fs.readFileSync(modulePath, 'utf8'), filePath: modulePath };
  };
}

module.exports = { createModuleLoader, findConfiguredProjectDir, findProjectDir, globalModulesDir };
