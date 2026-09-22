#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FableError, run } = require('./engine');
const { createModuleLoader, findConfiguredProjectDir, globalModulesDir } = require('./module-loader');
const { installPackage } = require('./package-manager');

function usage() {
  console.error('Использование:');
  console.error('  fable run <файл.fable>');
  console.error('  fable install <пакет> [--local] [--registry <URL>]');
}

async function main() {
  const [, , command, argument, ...options] = process.argv;
  if (command === 'install' && argument) {
    const registryIndex = options.indexOf('--registry');
    if (registryIndex >= 0 && !options[registryIndex + 1]) throw new Error('После --registry нужно указать URL.');
    const configuredProject = findConfiguredProjectDir(process.cwd());
    const localInstall = options.includes('--local') || Boolean(configuredProject);
    const projectDir = localInstall ? (configuredProject || process.cwd()) : path.join(os.homedir(), '.fable');
    const result = await installPackage(argument, {
      projectDir,
      modulesDir: localInstall ? undefined : globalModulesDir(),
      lockPath: localInstall ? undefined : path.join(projectDir, 'fable.lock.json'),
      registryUrl: registryIndex >= 0 ? options[registryIndex + 1] : undefined,
    });
    console.log(`Установлен ${result.name}@${result.version} (${localInstall ? 'в проект' : 'глобально'}): ${result.modulePath}`);
    return;
  }
  if (command !== 'run' || !argument) {
    usage();
    process.exitCode = 2;
    return;
  }

  const filePath = path.resolve(argument);
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    run(source, console.log, {
      filePath,
      loadModule: createModuleLoader(filePath),
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

main().catch((error) => {
  console.error(`FableScript: ${error.message}`);
  process.exitCode = 1;
});
