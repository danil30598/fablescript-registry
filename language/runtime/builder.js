'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findConfiguredProjectDir } = require('./module-loader');

const BUILD_MARKER = '.fablescript-build.json';
const SKIPPED_SOURCE_DIRECTORIES = new Set([
  '.git', '.github-publish', 'build', 'dist', 'node_modules', 'fable_modules',
  'runtime', 'test', 'tools', 'vscode-extension', 'packaging', 'registry',
]);

function executableName(value) {
  const normalized = String(value || 'app').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('Имя программы должно содержать латинскую букву или цифру.');
  return normalized;
}

function validNode(candidate) {
  if (!candidate || !fs.existsSync(candidate) || path.basename(candidate).toLowerCase() !== 'node.exe') return false;
  const check = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
  return check.status === 0 && /^v\d+\./.test(String(check.stdout).trim());
}

function findNodeExecutable(preferred) {
  const candidates = [preferred, process.env.FABLE_NODE_EXE];
  if (path.basename(process.execPath).toLowerCase() === 'node.exe') candidates.push(process.execPath);
  const discovered = spawnSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true });
  if (discovered.status === 0) candidates.push(...String(discovered.stdout).split(/\r?\n/).filter(Boolean));
  for (const candidate of candidates) if (validNode(candidate)) return path.resolve(candidate);
  throw new Error('Для сборки нужен node.exe. Установите Node.js или задайте путь через FABLE_NODE_EXE. Получателю программы Node.js не понадобится.');
}

function copyFableSources(sourceDirectory, destinationDirectory, excludedPath) {
  const walk = (current, relative) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const source = path.join(current, entry.name);
      if (source === excludedPath || source.startsWith(`${excludedPath}${path.sep}`)) continue;
      const nextRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_SOURCE_DIRECTORIES.has(entry.name)) continue;
        walk(source, nextRelative);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.fable') {
        const destination = path.join(destinationDirectory, nextRelative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
    }
  };
  walk(sourceDirectory, '');
}

function prepareOutput(outputDirectory) {
  if (!fs.existsSync(outputDirectory)) return;
  const entries = fs.readdirSync(outputDirectory);
  if (!entries.length) {
    fs.rmdirSync(outputDirectory);
    return;
  }
  const markerPath = path.join(outputDirectory, BUILD_MARKER);
  if (!fs.existsSync(markerPath)) throw new Error(`Папка сборки не пуста и не принадлежит FableScript: ${outputDirectory}`);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (marker.kind !== 'fablescript-portable-build') throw new Error(`Неверный маркер папки сборки: ${outputDirectory}`);
  fs.rmSync(outputDirectory, { recursive: true, force: true });
}

function renameWithRetry(source, destination) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 19) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

function buildPortable(entryFilePath, options = {}) {
  if (process.platform !== 'win32') throw new Error('Сборка .exe пока поддерживается только на Windows.');
  const entryPath = path.resolve(entryFilePath);
  if (path.extname(entryPath).toLowerCase() !== '.fable' || !fs.existsSync(entryPath)) throw new Error(`Не найден входной файл .fable: ${entryPath}`);
  const projectDirectory = findConfiguredProjectDir(path.dirname(entryPath)) || path.dirname(entryPath);
  const configPath = path.join(projectDirectory, 'fable.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const name = executableName(options.name || config.name || path.basename(entryPath, '.fable'));
  const outputDirectory = path.resolve(options.outputDirectory || path.join(projectDirectory, 'dist', name));
  const projectRoot = path.resolve(projectDirectory);
  if (outputDirectory === projectRoot || path.dirname(outputDirectory) === outputDirectory) throw new Error('Папка сборки не может совпадать с корнем проекта или диска.');
  const nodeExecutable = findNodeExecutable(options.nodeExecutable);
  prepareOutput(outputDirectory);
  const stagingDirectory = `${outputDirectory}.tmp-${process.pid}`;
  if (fs.existsSync(stagingDirectory)) fs.rmSync(stagingDirectory, { recursive: true, force: true });
  try {
    const appDirectory = path.join(stagingDirectory, 'app');
    const bundledProject = path.join(appDirectory, 'project');
    const bundledRuntime = path.join(appDirectory, 'runtime');
    fs.mkdirSync(bundledProject, { recursive: true });
    fs.mkdirSync(bundledRuntime, { recursive: true });

    copyFableSources(projectRoot, bundledProject, outputDirectory);
    for (const name of ['fable.json', 'fable.lock.json']) {
      const source = path.join(projectRoot, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(bundledProject, name));
    }
    const modulesSource = path.join(projectRoot, 'fable_modules');
    if (fs.existsSync(modulesSource)) fs.cpSync(modulesSource, path.join(bundledProject, 'fable_modules'), { recursive: true });

    for (const runtimeFile of ['engine.js', 'module-loader.js', 'console-input.js']) {
      fs.copyFileSync(path.join(__dirname, runtimeFile), path.join(bundledRuntime, runtimeFile));
    }
    fs.cpSync(path.join(__dirname, 'native-modules'), path.join(bundledRuntime, 'native-modules'), { recursive: true });
    const executablePath = path.join(stagingDirectory, `${name}.exe`);
    fs.copyFileSync(nodeExecutable, executablePath);

    const entryRelative = path.relative(projectRoot, entryPath);
    const runnerSource = `'use strict';\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst { FableError, run } = require('./runtime/engine');\nconst { createModuleLoader } = require('./runtime/module-loader');\nconst { readConsoleInput } = require('./runtime/console-input');\nconst filePath = path.join(__dirname, 'project', ${JSON.stringify(entryRelative)});\ntry {\n  const source = fs.readFileSync(filePath, 'utf8');\n  run(source, console.log, { filePath, loadModule: createModuleLoader(filePath), input: readConsoleInput });\n} catch (error) {\n  if (error instanceof FableError) {\n    console.error(\`${'${error.filePath || filePath}'}:${'${error.line}'}:${'${error.column}'}: ${'${error.message}'}\`);\n    process.exitCode = 1;\n  } else {\n    console.error(\`FableScript: ${'${error.message}'}\`);\n    process.exitCode = 1;\n  }\n}\n`;
    fs.writeFileSync(path.join(appDirectory, 'runner.js'), runnerSource, 'utf8');
    const launcherPath = path.join(stagingDirectory, `${name}.cmd`);
    const launcherSource = `@echo off\r\nchcp 65001 >nul\r\n"%~dp0${name}.exe" "%~dp0app\\runner.js" %*\r\nif errorlevel 1 pause\r\n`;
    fs.writeFileSync(launcherPath, launcherSource, 'ascii');
    fs.writeFileSync(path.join(stagingDirectory, 'КАК ЗАПУСТИТЬ.txt'), `Запустите файл ${name}.cmd.\r\n\r\n${name}.exe — это встроенный Node.js, его не нужно устанавливать отдельно.\r\nПередавайте всю папку целиком.\r\n`, 'utf8');
    fs.writeFileSync(path.join(stagingDirectory, BUILD_MARKER), `${JSON.stringify({ kind: 'fablescript-portable-build', name, entry: entryRelative }, null, 2)}\n`, 'utf8');
    fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
    renameWithRetry(stagingDirectory, outputDirectory);
    return {
      name,
      executablePath: path.join(outputDirectory, `${name}.exe`),
      launcherPath: path.join(outputDirectory, `${name}.cmd`),
      outputDirectory,
      nodeExecutable,
    };
  } catch (error) {
    if (fs.existsSync(stagingDirectory)) fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { BUILD_MARKER, buildPortable, executableName, findNodeExecutable };
