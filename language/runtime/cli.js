#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FableError, run } = require('./engine');
const { buildPortable } = require('./builder');
const { readConsoleInput } = require('./console-input');
const { createModuleLoader, findConfiguredProjectDir, globalModulesDir } = require('./module-loader');
const { DEFAULT_REGISTRY_URL, installPackage } = require('./package-manager');

function usage() {
  console.error('Использование:');
  console.error('  fable new <имя проекта>');
  console.error('  fable run [файл.fable]');
  console.error('  fable build <файл.fable> [--output <папка>] [--name <имя>]');
  console.error('  fable install <пакет> [--local] [--registry <URL>]');
}

function projectEntry(directory) {
  const configPath = path.join(directory, 'fable.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.entry !== undefined && (typeof config.entry !== 'string' || !config.entry.trim())) throw new Error('Поле entry в fable.json должно быть непустой строкой.');
    return path.resolve(directory, config.entry || 'main.fable');
  }
  const fallback = path.join(directory, 'main.fable');
  return fs.existsSync(fallback) ? fallback : null;
}

function createProject(name, directory) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name || '')) throw new Error('Имя проекта должно начинаться с латинской буквы или _ и содержать только буквы, цифры, _ и -.');
  const target = path.resolve(directory, name);
  if (fs.existsSync(target)) throw new Error(`Папка уже существует: ${target}`);
  fs.mkdirSync(path.join(target, 'fable_modules'), { recursive: true });
  fs.writeFileSync(path.join(target, 'main.fable'), 'print("Привет из FableScript!")\n', 'utf8');
  fs.writeFileSync(path.join(target, 'fable.json'), `${JSON.stringify({ name, entry: 'main.fable', registry: DEFAULT_REGISTRY_URL }, null, 2)}\n`, 'utf8');
  return target;
}

async function main(argv = process.argv.slice(2), workingDirectory = process.cwd()) {
  const [command, argument, ...options] = argv;
  if (command === 'new' && argument) {
    const target = createProject(argument, workingDirectory);
    console.log(`Проект создан: ${target}`);
    console.log(`Дальше: cd ${argument}`);
    console.log('Запуск: fable run');
    return;
  }
  if (command === 'install' && argument) {
    const registryIndex = options.indexOf('--registry');
    if (registryIndex >= 0 && !options[registryIndex + 1]) throw new Error('После --registry нужно указать URL.');
    const configuredProject = findConfiguredProjectDir(workingDirectory);
    const localInstall = options.includes('--local') || Boolean(configuredProject);
    const projectDir = localInstall ? (configuredProject || workingDirectory) : path.join(os.homedir(), '.fable');
    const result = await installPackage(argument, {
      projectDir,
      modulesDir: localInstall ? undefined : globalModulesDir(),
      lockPath: localInstall ? undefined : path.join(projectDir, 'fable.lock.json'),
      registryUrl: registryIndex >= 0 ? options[registryIndex + 1] : undefined,
    });
    console.log(`Установлен ${result.name}@${result.version} (${localInstall ? 'в проект' : 'глобально'}): ${result.modulePath}`);
    return;
  }
  if (command === 'build' && argument) {
    const optionValue = (name) => {
      const index = options.indexOf(name);
      if (index < 0) return undefined;
      if (!options[index + 1]) throw new Error(`После ${name} нужно указать значение.`);
      return options[index + 1];
    };
    const result = buildPortable(argument, {
      outputDirectory: optionValue('--output'),
      name: optionValue('--name'),
      nodeExecutable: optionValue('--node'),
    });
    console.log(`Собрано: ${result.outputDirectory}`);
    console.log(`Запуск: ${result.launcherPath}`);
    console.log('Передавайте получателю всю папку сборки. Node.js устанавливать не нужно.');
    return;
  }
  if (command !== 'run') {
    usage();
    process.exitCode = 2;
    return;
  }

  const filePath = argument ? path.resolve(workingDirectory, argument) : projectEntry(workingDirectory);
  if (!filePath) {
    console.error('Не найден fable.json или main.fable. Укажите файл: fable run <файл.fable>');
    process.exitCode = 2;
    return;
  }
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    run(source, console.log, {
      filePath,
      loadModule: createModuleLoader(filePath),
      input: readConsoleInput,
    });
  } catch (error) {
    if (error instanceof FableError) {
      console.error(`${error.filePath || filePath}:${error.line}:${error.column}: ${error.message}`);
      process.exitCode = 1;
    } else if (error && error.code === 'ENOENT') {
      console.error(`Файл не найден: ${filePath}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FableScript: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createProject, main, projectEntry };
