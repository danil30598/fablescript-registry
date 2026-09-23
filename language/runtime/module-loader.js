'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WINDOW_MEMBERS, createWindowModule } = require('./native-modules/window');

const BUILTIN_MODULES = [
  { name: 'window', detail: 'Графика FableScript — установите: fable install window', members: WINDOW_MEMBERS },
];

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

function containedPath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) throw new Error('Нативный пакет содержит неверный путь.');
  const target = path.resolve(root, relativePath);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Нативный пакет содержит небезопасный путь.');
  return target;
}

function findNativePackage(name, projectDir) {
  const candidates = [
    path.join(projectDir, 'fable_modules', '.native', name),
    path.join(globalModulesDir(), '.native', name),
  ];
  for (const packagePath of candidates) {
    const manifestPath = path.join(packagePath, 'fable-native.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== name) throw new Error(`Неверный манифест нативного пакета «${name}».`);
    const hostPath = containedPath(packagePath, manifest.host);
    const pythonExecutable = containedPath(packagePath, manifest.python);
    if (!fs.existsSync(hostPath) || !fs.existsSync(pythonExecutable)) throw new Error(`Пакет «${name}» повреждён. Переустановите его.`);
    return { packagePath, manifest, hostPath, pythonExecutable };
  }
  return null;
}

function createModuleLoader(entryFilePath) {
  const projectDir = findProjectDir(entryFilePath);
  return (name, importerPath) => {
    if (name === 'window') {
      const installed = findNativePackage(name, projectDir);
      if (!installed) throw new Error('Пакет window не установлен. Выполните: fable install window');
      return {
        filePath: installed.hostPath,
        nativeExports: createWindowModule({
          baseDirectory: path.dirname(importerPath),
          hostPath: installed.hostPath,
          pythonExecutable: installed.pythonExecutable,
        }),
        nativeMembers: WINDOW_MEMBERS,
      };
    }
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

function builtinModules() {
  return BUILTIN_MODULES.map((module) => ({ ...module, members: module.members.map((member) => ({ ...member })) }));
}

module.exports = { builtinModules, createModuleLoader, findConfiguredProjectDir, findNativePackage, findProjectDir, globalModulesDir };
