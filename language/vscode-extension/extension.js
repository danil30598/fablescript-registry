'use strict';

const path = require('node:path');
const fs = require('node:fs');
const vscode = require('vscode');

const packagedRuntime = path.resolve(__dirname, 'runtime');
const developmentRuntime = path.resolve(__dirname, '..', 'runtime');
const runtimePath = fs.existsSync(path.join(packagedRuntime, 'engine.js'))
  ? packagedRuntime
  : developmentRuntime;
const { FableError, parse, run, validate } = require(path.join(runtimePath, 'engine.js'));
const { createModuleLoader, findProjectDir, globalModulesDir } = require(path.join(runtimePath, 'module-loader.js'));
const { installPackage } = require(path.join(runtimePath, 'package-manager.js'));

function discoverModules(filePath) {
  const projectDir = findProjectDir(filePath);
  const directories = [
    { path: path.dirname(filePath), detail: 'Локальный модуль FableScript' },
    { path: path.join(projectDir, 'fable_modules'), detail: 'Пакет проекта FableScript' },
    { path: globalModulesDir(), detail: 'Глобальный пакет FableScript' },
  ];
  const modules = new Map();
  for (const directory of directories) {
    if (!fs.existsSync(directory.path)) continue;
    for (const entry of fs.readdirSync(directory.path, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name) !== '.fable') continue;
      const modulePath = path.join(directory.path, entry.name);
      if (path.resolve(modulePath) === path.resolve(filePath)) continue;
      const name = path.basename(entry.name, '.fable');
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !modules.has(name)) {
        modules.set(name, { name, path: modulePath, detail: directory.detail });
      }
    }
  }
  return [...modules.values()];
}

function exportedMembers(modulePath) {
  try {
    return parse(fs.readFileSync(modulePath, 'utf8'))
      .filter((statement) => ['function', 'class', 'declaration'].includes(statement.kind) && !statement.name.startsWith('_'));
  } catch {
    return [];
  }
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('fablescript');
  context.subscriptions.push(diagnostics);

  const output = vscode.window.createOutputChannel('FableScript');
  context.subscriptions.push(output);

  const runButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  runButton.text = '$(play) Run FableScript';
  runButton.tooltip = 'Запустить текущий файл FableScript (F6)';
  runButton.command = 'fablescript.runFile';
  context.subscriptions.push(runButton);

  const updateRunButton = () => {
    if (vscode.window.activeTextEditor?.document.languageId === 'fablescript') {
      runButton.show();
    } else {
      runButton.hide();
    }
  };

  const updateDiagnostics = (document) => {
    if (document.languageId !== 'fablescript') return;
    const problems = validate(document.getText()).map((problem) => {
      const line = Math.max(0, problem.line - 1);
      const column = Math.max(0, problem.column - 1);
      const range = new vscode.Range(line, column, line, column + 1);
      const diagnostic = new vscode.Diagnostic(
        range,
        problem.message,
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.source = 'FableScript';
      return diagnostic;
    });
    diagnostics.set(document.uri, problems);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => updateDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.window.onDidChangeActiveTextEditor(updateRunButton),
  );

  for (const document of vscode.workspace.textDocuments) updateDiagnostics(document);
  updateRunButton();

  context.subscriptions.push(vscode.commands.registerCommand('fablescript.runFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fablescript') {
      void vscode.window.showErrorMessage('Откройте файл FableScript с расширением .fable.');
      return;
    }

    if (editor.document.isDirty) await editor.document.save();
    if (editor.document.isUntitled) {
      void vscode.window.showErrorMessage('Сохраните файл перед запуском.');
      return;
    }

    output.clear();
    output.appendLine(`Запуск ${path.basename(editor.document.uri.fsPath)}`);
    output.appendLine('');
    try {
      const filePath = editor.document.uri.fsPath;
      run(editor.document.getText(), (value) => output.appendLine(value), {
        filePath,
        loadModule: createModuleLoader(filePath),
      });
      output.appendLine('');
      output.appendLine('Программа завершена.');
    } catch (error) {
      if (error instanceof FableError) {
        output.appendLine(`${error.filePath || editor.document.uri.fsPath}:${error.line}:${error.column}: ${error.message}`);
        void vscode.window.showErrorMessage(`FableScript: ${error.message}`);
      } else {
        throw error;
      }
    }
    output.show(true);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('fablescript.installPackage', async () => {
    const packageName = await vscode.window.showInputBox({
      title: 'Установить пакет FableScript',
      prompt: 'Имя пакета или имя@версия',
      placeHolder: 'example или example@1.0.0',
      validateInput: (value) => /^[A-Za-z_][A-Za-z0-9_]*(?:@[^@\s]+)?$/.test(value) ? null : 'Используйте латинские буквы, цифры и _.',
    });
    if (!packageName) return;

    const editorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectDir = editorPath ? findProjectDir(editorPath) : workspacePath;
    if (!projectDir) {
      void vscode.window.showErrorMessage('Сначала откройте папку проекта FableScript.');
      return;
    }
    const registryUrl = vscode.workspace.getConfiguration('fablescript').get('registryUrl') || undefined;
    try {
      const result = await installPackage(packageName, { projectDir, registryUrl });
      void vscode.window.showInformationMessage(`Установлен ${result.name}@${result.version}.`);
    } catch (error) {
      void vscode.window.showErrorMessage(`FableScript: ${error.message}`);
    }
  }));

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(
    { language: 'fablescript', scheme: 'file' },
    {
      provideCodeLenses(document) {
        if (document.lineCount === 0) return [];
        return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          command: 'fablescript.runFile',
          title: '$(play) Запустить FableScript (F6)',
        })];
      },
    },
  ));

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
    { language: 'fablescript', scheme: 'file' },
    {
      provideCompletionItems(document, position) {
        const snippet = (label, body, detail) => {
          const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
          item.insertText = new vscode.SnippetString(body);
          item.detail = detail;
          item.sortText = `0-${label}`;
          return item;
        };

        const memberSuggestions = [
          new vscode.CompletionItem('len', vscode.CompletionItemKind.Property),
          snippet('add', 'add(${1:value})', 'Добавить значение в список'),
          snippet('remove', 'remove(${1:value})', 'Удалить первое совпадающее значение'),
        ];
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        const modules = document.isUntitled ? [] : discoverModules(document.uri.fsPath);
        const importContext = linePrefix.match(/^\s*import\s+([A-Za-z_]*)$/);
        if (importContext) {
          return modules.map((module) => {
            const item = new vscode.CompletionItem(module.name, vscode.CompletionItemKind.Module);
            item.detail = module.detail;
            item.documentation = `Подключить ${module.name}.fable`;
            item.sortText = `0-${module.name}`;
            return item;
          });
        }

        const memberContext = linePrefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_]*)$/);
        if (memberContext) {
          const moduleName = memberContext[1];
          const imported = new RegExp(`^\\s*import\\s+${moduleName}\\s*$`, 'm').test(document.getText());
          const module = imported ? modules.find((candidate) => candidate.name === moduleName) : null;
          if (!module) return memberSuggestions;
          return exportedMembers(module.path).map((member) => {
            const callable = member.kind === 'function' || member.kind === 'class';
            const kind = member.kind === 'function'
              ? vscode.CompletionItemKind.Function
              : member.kind === 'class' ? vscode.CompletionItemKind.Class : vscode.CompletionItemKind.Variable;
            const item = new vscode.CompletionItem(member.name, kind);
            item.detail = `${member.kind === 'class' ? 'Класс' : member.kind === 'function' ? 'Функция' : 'Переменная'} из ${moduleName}`;
            if (callable) item.insertText = new vscode.SnippetString(`${member.name}($0)`);
            item.sortText = `0-${member.name}`;
            return item;
          });
        }

        const suggestions = [
          snippet('import', 'import ${1:module}', 'Подключить локальный модуль'),
          snippet('print', 'print(${1:value})', 'Вывести значение'),
          snippet('var', 'var ${1:name} = ${2:value}', 'Объявить переменную с автоматическим типом'),
          snippet('list', 'var ${1:name} = [${2:values}]', 'Создать список'),
          snippet('table', 'var ${1:name} = {${2:key}: ${3:value}}', 'Создать таблицу'),
          snippet('if', 'if ${1:condition} {\n\t${0}\n}', 'Условие'),
          snippet('if else', 'if ${1:condition} {\n\t${2}\n} else {\n\t${0}\n}', 'Условие с альтернативной веткой'),
          snippet('while', 'while ${1:condition} {\n\t${0}\n}', 'Цикл с условием'),
          snippet('repeat', 'repeat ${1:count} times {\n\t${0}\n}', 'Повторить блок заданное число раз'),
          snippet('for', 'for ${1:item} in ${2:collection} {\n\t${0}\n}', 'Перебрать список или ключи таблицы'),
          snippet('func', 'func ${1:name}(${2:int value})\n{\n\t${0}\n}', 'Объявить функцию'),
          snippet('class', 'class ${1:Name}\n{\n\t${0}\n}', 'Объявить класс'),
          snippet('__init', '__init(${1:parameters})\n{\n\t${0}\n}', 'Конструктор класса'),
          snippet('return', 'return ${1:value}', 'Вернуть значение из функции'),
        ];

        for (const module of modules) {
          const item = new vscode.CompletionItem(`import ${module.name}`, vscode.CompletionItemKind.Module);
          item.insertText = `import ${module.name}`;
          item.detail = module.detail;
          item.sortText = `0-import-${module.name}`;
          suggestions.push(item);
        }

        for (const keyword of ['int', 'float', 'string', 'bool', 'any', 'self', 'true', 'false', 'and', 'or', 'not', 'in', 'times']) {
          const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
          item.detail = 'Ключевое слово FableScript';
          item.sortText = `1-${keyword}`;
          suggestions.push(item);
        }

        const declaredNames = new Set();
        const declaration = /^\s*(?:var|int|float|string|bool)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
        let match;
        while ((match = declaration.exec(document.getText())) !== null) declaredNames.add(match[1]);
        for (const name of declaredNames) {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
          item.detail = 'Переменная FableScript';
          item.sortText = `2-${name}`;
          suggestions.push(item);
        }
        const declaredFunctions = new Set();
        const functionDeclaration = /^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
        while ((match = functionDeclaration.exec(document.getText())) !== null) declaredFunctions.add(match[1]);
        for (const name of declaredFunctions) {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
          item.detail = 'Функция FableScript';
          item.insertText = new vscode.SnippetString(`${name}($0)`);
          item.sortText = `2-${name}`;
          suggestions.push(item);
        }
        const declaredClasses = new Set();
        const classDeclaration = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
        while ((match = classDeclaration.exec(document.getText())) !== null) declaredClasses.add(match[1]);
        for (const name of declaredClasses) {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
          item.detail = 'Класс FableScript';
          item.insertText = new vscode.SnippetString(`${name}($0)`);
          item.sortText = `2-${name}`;
          suggestions.push(item);
        }
        return suggestions;
      },
    },
    '.', ' ',
  ));
}

function deactivate() {}

module.exports = { activate, deactivate };
