'use strict';

class FableError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = 'FableError';
    this.line = line;
    this.column = column;
  }
}

function stripComment(text) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (char === quote) { quote = null; continue; }
    if (!quote && (char === '"' || char === "'")) { quote = char; continue; }
    if (!quote && char === '/' && text[i + 1] === '/') return text.slice(0, i);
  }
  return text;
}

function meaningfulLines(source) {
  return source.replace(/\r\n?/g, '\n').split('\n').flatMap((original, index) => {
    const uncommented = stripComment(original);
    const text = uncommented.trim();
    return text ? [{ text, line: index + 1, column: uncommented.indexOf(text) + 1 }] : [];
  });
}

function tokenize(text, line, baseColumn) {
  const tokens = [];
  let i = 0;
  const push = (type, value, start, extra = {}) => tokens.push({ type, value, line, column: baseColumn + start, ...extra });
  while (i < text.length) {
    if (/\s/.test(text[i])) { i += 1; continue; }
    const doubleOperator = text.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(doubleOperator)) {
      push(doubleOperator, doubleOperator, i);
      i += 2;
      continue;
    }
    if ('+-*/()<>[]{},:.'.includes(text[i])) { push(text[i], text[i], i); i += 1; continue; }
    if (text[i] === '"' || text[i] === "'") {
      const start = i;
      const quote = text[i++];
      let value = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === quote) { i += 1; closed = true; break; }
        if (text[i] === '\\') {
          const escape = text[i + 1];
          const escapes = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          if (!(escape in escapes)) throw new FableError(`Неизвестная escape-последовательность \\${escape}.`, line, baseColumn + i);
          value += escapes[escape];
          i += 2;
        } else {
          value += text[i++];
        }
      }
      if (!closed) throw new FableError('Строка не закрыта кавычкой.', line, baseColumn + start);
      push('literal', value, start, { valueType: 'string' });
      continue;
    }
    const number = text.slice(i).match(/^\d+(?:\.\d+)?/);
    if (number) {
      const raw = number[0];
      push('literal', Number(raw), i, { valueType: raw.includes('.') ? 'float' : 'int' });
      i += raw.length;
      continue;
    }
    const identifier = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      const raw = identifier[0];
      if (raw === 'true' || raw === 'false') push('literal', raw === 'true', i, { valueType: 'bool' });
      else if (raw === 'and' || raw === 'or' || raw === 'not') push(raw, raw, i);
      else push('identifier', raw, i);
      i += raw.length;
      continue;
    }
    throw new FableError(`Неожиданный символ «${text[i]}» в выражении.`, line, baseColumn + i);
  }
  return tokens;
}

function parseExpression(text, line, column) {
  const tokens = tokenize(text, line, column);
  let position = 0;
  const current = () => tokens[position];
  function atom() {
    const token = current();
    if (!token) throw new FableError('Ожидалось значение.', line, column + text.length);
    if (token.type === 'literal') { position += 1; return { kind: 'literal', ...token }; }
    if (token.type === 'identifier') {
      position += 1;
      return { kind: 'identifier', name: token.value, line, column: token.column };
    }
    if (token.type === '[') {
      position += 1;
      const elements = [];
      while (current() && current().type !== ']') {
        elements.push(logicalOr());
        if (current()?.type === ',') position += 1;
        else if (current()?.type !== ']') throw new FableError('Элементы списка разделяются запятыми.', line, current()?.column ?? column + text.length);
      }
      if (current()?.type !== ']') throw new FableError('Список не закрыт скобкой ].', line, column + text.length);
      position += 1;
      return { kind: 'list', elements, line, column: token.column };
    }
    if (token.type === '{') {
      position += 1;
      const entries = [];
      const keys = new Set();
      while (current() && current().type !== '}') {
        const key = current();
        if (key.type !== 'identifier' && !(key.type === 'literal' && key.valueType === 'string')) throw new FableError('Ключ таблицы должен быть именем или строкой.', line, key.column);
        position += 1;
        if (keys.has(String(key.value))) throw new FableError(`Ключ «${key.value}» указан дважды.`, line, key.column);
        if (['len', 'add', 'remove'].includes(String(key.value))) throw new FableError(`Ключ «${key.value}» зарезервирован.`, line, key.column);
        keys.add(String(key.value));
        if (current()?.type !== ':') throw new FableError('После ключа таблицы ожидался символ :.', line, current()?.column ?? column + text.length);
        position += 1;
        entries.push({ key: String(key.value), value: logicalOr() });
        if (current()?.type === ',') position += 1;
        else if (current()?.type !== '}') throw new FableError('Элементы таблицы разделяются запятыми.', line, current()?.column ?? column + text.length);
      }
      if (current()?.type !== '}') throw new FableError('Таблица не закрыта скобкой }.', line, column + text.length);
      position += 1;
      return { kind: 'table', entries, line, column: token.column };
    }
    if (token.type === '(') {
      position += 1;
      const value = logicalOr();
      if (current()?.type !== ')') throw new FableError('Ожидалась закрывающая скобка.', line, current()?.column ?? column + text.length);
      position += 1;
      return value;
    }
    throw new FableError('Ожидалось значение или выражение в скобках.', line, token.column);
  }
  function primary() {
    let expression = atom();
    while (true) {
      if (current()?.type === '(') {
        const callToken = current();
        position += 1;
        const args = [];
        while (current() && current().type !== ')') {
          args.push(logicalOr());
          if (current()?.type === ',') position += 1;
        }
        if (current()?.type !== ')') throw new FableError('Вызов не закрыт скобкой.', line, current()?.column ?? column + text.length);
        position += 1;
        if (expression.kind === 'identifier') expression = { kind: 'call', name: expression.name, args, line, column: expression.column };
        else if (expression.kind === 'member') expression = { kind: 'methodCall', object: expression.object, name: expression.name, args, line, column: callToken.column };
        else throw new FableError('Это значение нельзя вызвать.', line, callToken.column);
        continue;
      }
      if (current()?.type === '[') {
        const bracket = current();
        position += 1;
        const index = logicalOr();
        if (current()?.type !== ']') throw new FableError('Индекс не закрыт скобкой ].', line, current()?.column ?? column + text.length);
        position += 1;
        expression = { kind: 'index', object: expression, index, line, column: bracket.column };
        continue;
      }
      if (current()?.type === '.') {
        const dot = current();
        position += 1;
        const name = current();
        if (name?.type !== 'identifier') throw new FableError('После точки ожидалось имя свойства.', line, name?.column ?? dot.column + 1);
        position += 1;
        expression = { kind: 'member', object: expression, name: name.value, line, column: dot.column };
        continue;
      }
      return expression;
    }
  }
  function unary() {
    const token = current();
    if (token?.type === '-' || token?.type === 'not') {
      position += 1;
      return { kind: 'unary', operator: token.type, value: unary(), line, column: token.column };
    }
    return primary();
  }
  function multiply() {
    let left = unary();
    while (current()?.type === '*' || current()?.type === '/') {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: unary(), line, column: operator.column };
    }
    return left;
  }
  function add() {
    let left = multiply();
    while (current()?.type === '+' || current()?.type === '-') {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: multiply(), line, column: operator.column };
    }
    return left;
  }
  function comparison() {
    let left = add();
    while (['<', '>', '<=', '>='].includes(current()?.type)) {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: add(), line, column: operator.column };
    }
    return left;
  }
  function equality() {
    let left = comparison();
    while (current()?.type === '==' || current()?.type === '!=') {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: comparison(), line, column: operator.column };
    }
    return left;
  }
  function logicalAnd() {
    let left = equality();
    while (current()?.type === 'and') {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: equality(), line, column: operator.column };
    }
    return left;
  }
  function logicalOr() {
    let left = logicalAnd();
    while (current()?.type === 'or') {
      const operator = tokens[position++];
      left = { kind: 'binary', operator: operator.type, left, right: logicalAnd(), line, column: operator.column };
    }
    return left;
  }
  if (!tokens.length) throw new FableError('Ожидалось значение.', line, column);
  const result = logicalOr();
  if (position < tokens.length) throw new FableError('Лишняя часть выражения.', line, current().column);
  return result;
}

function parseSimpleStatement(sourceLine) {
  const text = sourceLine.text.endsWith(';') ? sourceLine.text.slice(0, -1).trimEnd() : sourceLine.text;
  let match = text.match(/^import\s+([A-Za-z_][A-Za-z0-9_]*)$/);
  if (match) return { kind: 'import', name: match[1], ...sourceLine };
  match = text.match(/^return(?:\s+(.+))?$/);
  if (match) {
    const expressionText = match[1];
    return {
      kind: 'return',
      expression: expressionText
        ? parseExpression(expressionText, sourceLine.line, sourceLine.column + text.indexOf(expressionText))
        : null,
      ...sourceLine,
    };
  }
  match = text.match(/^print\s*\((.*)\)$/);
  if (match) {
    const offset = text.indexOf(match[1]);
    return { kind: 'print', expression: parseExpression(match[1], sourceLine.line, sourceLine.column + offset), ...sourceLine };
  }
  match = text.match(/^(var|int|float|string|bool|list<(?:int|float|string|bool|any)>)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (match) {
    const [, declaredType, name, expressionText] = match;
    return { kind: 'declaration', declaredType, name, nameColumn: sourceLine.column + text.indexOf(name), expression: parseExpression(expressionText, sourceLine.line, sourceLine.column + text.indexOf(expressionText)), ...sourceLine };
  }
  match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (match) {
    const [, objectName, memberName, expressionText] = match;
    return {
      kind: 'memberAssignment',
      object: { kind: 'identifier', name: objectName, line: sourceLine.line, column: sourceLine.column },
      name: memberName,
      expression: parseExpression(expressionText, sourceLine.line, sourceLine.column + text.indexOf(expressionText)),
      ...sourceLine,
    };
  }
  match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (match) {
    const [, name, expressionText] = match;
    return { kind: 'assignment', name, nameColumn: sourceLine.column + text.indexOf(name), expression: parseExpression(expressionText, sourceLine.line, sourceLine.column + text.indexOf(expressionText)), ...sourceLine };
  }
  const expression = parseExpression(text, sourceLine.line, sourceLine.column);
  if (expression.kind === 'call' || expression.kind === 'methodCall') return { kind: 'expression', expression, ...sourceLine };
  throw new FableError('Ожидалось объявление переменной, присваивание, условие или print(...).', sourceLine.line, sourceLine.column);
}

function parseParameters(text, line, column) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.includes(',')) throw new FableError('Параметры функции разделяются пробелами, без запятых.', line, column);
  const parts = trimmed.split(/\s+/);
  if (parts.length % 2 !== 0) throw new FableError('Для каждого параметра нужны тип и имя.', line, column);
  const parameters = [];
  const names = new Set();
  for (let index = 0; index < parts.length; index += 2) {
    const type = parts[index];
    const name = parts[index + 1];
    if (!['int', 'float', 'string', 'bool'].includes(type)) throw new FableError(`Неизвестный тип параметра «${type}».`, line, column);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new FableError(`Некорректное имя параметра «${name}».`, line, column);
    if (names.has(name)) throw new FableError(`Параметр «${name}» указан дважды.`, line, column);
    names.add(name);
    parameters.push({ type, name });
  }
  return parameters;
}

function parseConstructorParameters(text, line, column) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parameters = [];
  const names = new Set();
  for (const rawParameter of trimmed.split(',')) {
    const parts = rawParameter.trim().split(/\s+/);
    if (parts.length > 2) throw new FableError(`Некорректный параметр конструктора «${rawParameter.trim()}».`, line, column);
    const type = parts.length === 2 ? parts[0] : 'any';
    const name = parts.length === 2 ? parts[1] : parts[0];
    if (!['int', 'float', 'string', 'bool', 'any'].includes(type)) throw new FableError(`Неизвестный тип параметра «${type}».`, line, column);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new FableError(`Некорректный параметр конструктора «${name}».`, line, column);
    if (names.has(name)) throw new FableError(`Параметр «${name}» указан дважды.`, line, column);
    names.add(name);
    parameters.push({ type, name });
  }
  return parameters;
}

function parseClass(lines, index, sourceLine, match) {
  const [, name, sameLineBrace] = match;
  let currentIndex = index + 1;
  if (!sameLineBrace) {
    if (lines[currentIndex]?.text !== '{') throw new FableError('После имени класса ожидалась открывающая скобка {.', sourceLine.line, sourceLine.column);
    currentIndex += 1;
  }
  const fields = [];
  const methods = [];
  let constructor = null;
  while (currentIndex < lines.length && lines[currentIndex].text !== '}') {
    const currentLine = lines[currentIndex];
    const fieldMatch = currentLine.text.match(/^(var|int|float|string|bool)\s+([A-Za-z_][A-Za-z0-9_]*)$/);
    if (fieldMatch) {
      fields.push({ type: fieldMatch[1] === 'var' ? 'any' : fieldMatch[1], name: fieldMatch[2], ...currentLine });
      currentIndex += 1;
      continue;
    }
    const constructorMatch = currentLine.text.match(/^__init\s*\((.*)\)\s*(\{)?$/);
    if (constructorMatch) {
      if (constructor) throw new FableError('В классе может быть только один __init.', currentLine.line, currentLine.column);
      const body = parseFollowingBlock(lines, currentIndex, Boolean(constructorMatch[2]), currentLine, '__init');
      constructor = {
        kind: 'constructor', name: '__init',
        parameters: parseConstructorParameters(constructorMatch[1], currentLine.line, currentLine.column),
        declaredReturnType: null, body: body.statements, ...currentLine,
      };
      currentIndex = body.next;
      continue;
    }
    const methodMatch = currentLine.text.match(/^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(?:->\s*(int|float|string|bool))?\s*(\{)?$/);
    if (methodMatch) {
      const [, methodName, parametersText, returnType, brace] = methodMatch;
      const body = parseFollowingBlock(lines, currentIndex, Boolean(brace), currentLine, `метода ${methodName}`);
      methods.push({
        kind: 'method', name: methodName,
        parameters: parseParameters(parametersText, currentLine.line, currentLine.column),
        declaredReturnType: returnType ?? null, body: body.statements, ...currentLine,
      });
      currentIndex = body.next;
      continue;
    }
    throw new FableError('В классе ожидалось поле, __init или метод.', currentLine.line, currentLine.column);
  }
  if (lines[currentIndex]?.text !== '}') throw new FableError(`Класс «${name}» не закрыт скобкой }.`, sourceLine.line, sourceLine.column);
  return { node: { kind: 'class', name, fields, methods, constructor, ...sourceLine }, next: currentIndex + 1 };
}

function parseFollowingBlock(lines, index, sameLineBrace, sourceLine, label) {
  let bodyStart = index + 1;
  if (!sameLineBrace) {
    if (lines[bodyStart]?.text !== '{') throw new FableError(`После ${label} ожидалась открывающая скобка { .`, sourceLine.line, sourceLine.column);
    bodyStart += 1;
  }
  const body = parseBlock(lines, bodyStart, true);
  if (body.terminator !== '}') throw new FableError(`Блок ${label} должен завершаться скобкой } .`, lines[body.index].line, lines[body.index].column);
  return { statements: body.statements, next: body.index + 1 };
}

function parseBlock(lines, start, nested) {
  const statements = [];
  let index = start;
  while (index < lines.length) {
    const sourceLine = lines[index];
    if (sourceLine.text === '}' || sourceLine.text === '} else {' || sourceLine.text === 'else {') {
      if (!nested) throw new FableError('Лишняя закрывающая скобка.', sourceLine.line, sourceLine.column);
      return { statements, index, terminator: sourceLine.text };
    }
    const classMatch = sourceLine.text.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\{)?$/);
    if (classMatch) {
      if (nested) throw new FableError('Классы можно объявлять только на верхнем уровне.', sourceLine.line, sourceLine.column);
      const parsedClass = parseClass(lines, index, sourceLine, classMatch);
      statements.push(parsedClass.node);
      index = parsedClass.next;
      continue;
    }
    const functionMatch = sourceLine.text.match(/^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(?:->\s*(int|float|string|bool))?\s*(\{)?$/);
    if (functionMatch) {
      if (nested) throw new FableError('Функции можно объявлять только на верхнем уровне.', sourceLine.line, sourceLine.column);
      const [, name, parametersText, returnType, sameLineBrace] = functionMatch;
      let bodyStart = index + 1;
      if (!sameLineBrace) {
        if (lines[bodyStart]?.text !== '{') throw new FableError('После заголовка функции ожидалась открывающая скобка {.', sourceLine.line, sourceLine.column);
        bodyStart += 1;
      }
      const body = parseBlock(lines, bodyStart, true);
      if (body.terminator !== '}') throw new FableError('Функция должна завершаться скобкой }.', lines[body.index].line, lines[body.index].column);
      statements.push({
        kind: 'function', name,
        parameters: parseParameters(parametersText, sourceLine.line, sourceLine.column + sourceLine.text.indexOf(parametersText)),
        declaredReturnType: returnType ?? null,
        body: body.statements,
        ...sourceLine,
      });
      index = body.index + 1;
      continue;
    }
    const whileSameLine = sourceLine.text.match(/^while\s+(.+)\s+\{$/);
    const whileNextLine = whileSameLine ? null : sourceLine.text.match(/^while\s+(.+)$/);
    const whileMatch = whileSameLine ?? whileNextLine;
    if (whileMatch) {
      const conditionText = whileMatch[1].trim();
      const body = parseFollowingBlock(lines, index, Boolean(whileSameLine), sourceLine, 'while');
      statements.push({
        kind: 'while',
        condition: parseExpression(conditionText, sourceLine.line, sourceLine.column + sourceLine.text.indexOf(conditionText)),
        body: body.statements,
        ...sourceLine,
      });
      index = body.next;
      continue;
    }
    const repeatSameLine = sourceLine.text.match(/^repeat\s+(.+)\s+times\s+\{$/);
    const repeatNextLine = repeatSameLine ? null : sourceLine.text.match(/^repeat\s+(.+)\s+times$/);
    const repeatMatch = repeatSameLine ?? repeatNextLine;
    if (repeatMatch) {
      const countText = repeatMatch[1].trim();
      const body = parseFollowingBlock(lines, index, Boolean(repeatSameLine), sourceLine, 'repeat');
      statements.push({
        kind: 'repeat',
        count: parseExpression(countText, sourceLine.line, sourceLine.column + sourceLine.text.indexOf(countText)),
        body: body.statements,
        ...sourceLine,
      });
      index = body.next;
      continue;
    }
    const forSameLine = sourceLine.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)\s+\{$/);
    const forNextLine = forSameLine ? null : sourceLine.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
    const forMatch = forSameLine ?? forNextLine;
    if (forMatch) {
      const [, name, collectionTextRaw] = forMatch;
      const collectionText = collectionTextRaw.trim();
      const body = parseFollowingBlock(lines, index, Boolean(forSameLine), sourceLine, 'for');
      statements.push({
        kind: 'for', name,
        collection: parseExpression(collectionText, sourceLine.line, sourceLine.column + sourceLine.text.indexOf(collectionText)),
        body: body.statements,
        ...sourceLine,
      });
      index = body.next;
      continue;
    }
    const ifMatch = sourceLine.text.match(/^if\s+(.+)\s*\{$/);
    if (!ifMatch) {
      statements.push(parseSimpleStatement(sourceLine));
      index += 1;
      continue;
    }

    const conditionText = ifMatch[1].trim();
    const conditionColumn = sourceLine.column + sourceLine.text.indexOf(conditionText);
    const thenBlock = parseBlock(lines, index + 1, true);
    let next = thenBlock.index + 1;
    let elseBranch = [];
    if (thenBlock.terminator === '} else {') {
      const elseBlock = parseBlock(lines, next, true);
      if (elseBlock.terminator !== '}') throw new FableError('Некорректное завершение блока else.', lines[elseBlock.index].line, lines[elseBlock.index].column);
      elseBranch = elseBlock.statements;
      next = elseBlock.index + 1;
    } else if (lines[next]?.text === 'else {') {
      const elseBlock = parseBlock(lines, next + 1, true);
      if (elseBlock.terminator !== '}') throw new FableError('Некорректное завершение блока else.', lines[elseBlock.index].line, lines[elseBlock.index].column);
      elseBranch = elseBlock.statements;
      next = elseBlock.index + 1;
    }
    statements.push({ kind: 'if', condition: parseExpression(conditionText, sourceLine.line, conditionColumn), thenBranch: thenBlock.statements, elseBranch, ...sourceLine });
    index = next;
  }
  if (nested) {
    const fallback = lines[lines.length - 1] ?? { line: 1, column: 1 };
    throw new FableError('Блок не закрыт фигурной скобкой.', fallback.line, fallback.column);
  }
  return { statements, index };
}

function parse(source) {
  return parseBlock(meaningfulLines(source), 0, false).statements;
}

const numeric = (type) => type === 'int' || type === 'float';
const typeName = (type) => {
  if (typeof type === 'string') return type;
  if (type.kind === 'list') return `list<${typeName(type.element)}>`;
  if (type.kind === 'table') return 'table';
  if (type.kind === 'instance') return type.name;
  if (type.kind === 'module') return `module ${type.name}`;
  return 'unknown';
};
const sameType = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left === 'string' || typeof right === 'string') return false;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'list') return sameType(left.element, right.element);
  if (left.kind === 'table') {
    if (left.fields.size !== right.fields.size) return false;
    return [...left.fields].every(([key, type]) => right.fields.has(key) && sameType(type, right.fields.get(key)));
  }
  if (left.kind === 'instance') return left.name === right.name;
  if (left.kind === 'module') return left.name === right.name;
  return false;
};
const assignable = (target, source) => {
  if (target === 'any') return true;
  if (sameType(target, source) || (target === 'float' && source === 'int')) return true;
  if (typeof target !== 'string' && typeof source !== 'string' && target.kind === 'list' && source.kind === 'list') {
    return source.element === 'unknown' || assignable(target.element, source.element);
  }
  return false;
};
const declaredType = (text) => {
  const list = text.match(/^list<(int|float|string|bool|any)>$/);
  return list ? { kind: 'list', element: list[1] } : text;
};

function typeOf(expression, symbols, context) {
  if (expression.kind === 'literal') return expression.valueType;
  if (expression.kind === 'identifier') {
    if (!symbols.has(expression.name)) throw new FableError(`Переменная «${expression.name}» не объявлена.`, expression.line, expression.column);
    return symbols.get(expression.name);
  }
  if (expression.kind === 'list') {
    if (!expression.elements.length) return { kind: 'list', element: 'unknown' };
    let element = typeOf(expression.elements[0], symbols, context);
    for (const item of expression.elements.slice(1)) {
      const itemType = typeOf(item, symbols, context);
      if (numeric(element) && numeric(itemType)) element = element === 'float' || itemType === 'float' ? 'float' : 'int';
      else if (!sameType(element, itemType)) element = 'any';
    }
    return { kind: 'list', element };
  }
  if (expression.kind === 'table') {
    const fields = new Map();
    for (const entry of expression.entries) fields.set(entry.key, typeOf(entry.value, symbols, context));
    return { kind: 'table', fields };
  }
  if (expression.kind === 'index') {
    const object = typeOf(expression.object, symbols, context);
    const index = typeOf(expression.index, symbols, context);
    if (typeof object === 'string' || object.kind !== 'list') throw new FableError('Индекс можно применять только к списку.', expression.line, expression.column);
    if (index !== 'int') throw new FableError('Индекс списка должен иметь тип int.', expression.line, expression.column);
    return object.element;
  }
  if (expression.kind === 'member') {
    const object = typeOf(expression.object, symbols, context);
    if (typeof object !== 'string' && object.kind === 'module') return 'any';
    if (expression.name === 'len' && (object === 'string' || (typeof object !== 'string' && (object.kind === 'list' || object.kind === 'table')))) return 'int';
    if (typeof object !== 'string' && object.kind === 'table') {
      if (!object.fields.has(expression.name)) throw new FableError(`В таблице нет ключа «${expression.name}».`, expression.line, expression.column);
      return object.fields.get(expression.name);
    }
    if (typeof object !== 'string' && object.kind === 'instance') {
      if (!object.fields.has(expression.name)) throw new FableError(`В классе ${object.name} нет поля «${expression.name}».`, expression.line, expression.column);
      return object.fields.get(expression.name);
    }
    throw new FableError(`У типа ${typeName(object)} нет свойства «${expression.name}».`, expression.line, expression.column);
  }
  if (expression.kind === 'methodCall') {
    const object = typeOf(expression.object, symbols, context);
    if (typeof object !== 'string' && object.kind === 'module') {
      for (const argument of expression.args) typeOf(argument, symbols, context);
      return 'any';
    }
    if (typeof object !== 'string' && object.kind === 'instance') {
      const method = object.methods.get(expression.name);
      if (!method) throw new FableError(`В классе ${object.name} нет метода «${expression.name}».`, expression.line, expression.column);
      if (expression.args.length !== method.parameters.length) throw new FableError(`Метод «${expression.name}» ожидает ${method.parameters.length} аргументов.`, expression.line, expression.column);
      expression.args.forEach((argument, index) => {
        const actual = typeOf(argument, symbols, context);
        const expected = method.parameters[index].type;
        if (!assignable(expected, actual)) throw new FableError(`Аргумент ${index + 1} метода «${expression.name}» должен иметь тип ${typeName(expected)}.`, argument.line, argument.column);
      });
      if (!method.returnType) inferFunction(method, context);
      return method.returnType;
    }
    if (typeof object === 'string' || object.kind !== 'list' || !['add', 'remove'].includes(expression.name)) throw new FableError(`У типа ${typeName(object)} нет метода «${expression.name}».`, expression.line, expression.column);
    if (expression.args.length !== 1) throw new FableError(`Метод ${expression.name} ожидает один аргумент.`, expression.line, expression.column);
    const argument = typeOf(expression.args[0], symbols, context);
    if (object.element === 'unknown') object.element = argument;
    else if (!assignable(object.element, argument)) throw new FableError(`Метод ${expression.name} ожидает ${typeName(object.element)}, получен ${typeName(argument)}.`, expression.line, expression.column);
    return expression.name === 'remove' ? 'bool' : 'void';
  }
  if (expression.kind === 'call') {
    const fn = context.functions.get(expression.name);
    if (!fn) {
      const classInfo = context.classes.get(expression.name);
      if (!classInfo) throw new FableError(`Функция или класс «${expression.name}» не объявлены.`, expression.line, expression.column);
      const parameters = classInfo.constructor?.parameters ?? [];
      if (expression.args.length !== parameters.length) throw new FableError(`Класс «${expression.name}» ожидает ${parameters.length} аргументов.`, expression.line, expression.column);
      expression.args.forEach((argument) => typeOf(argument, symbols, context));
      return classInfo;
    }
    if (expression.args.length !== fn.parameters.length) {
      throw new FableError(`Функция «${expression.name}» ожидает ${fn.parameters.length} аргументов, получено ${expression.args.length}.`, expression.line, expression.column);
    }
    expression.args.forEach((argument, index) => {
      const actual = typeOf(argument, symbols, context);
      const expected = fn.parameters[index].type;
      if (!assignable(expected, actual)) throw new FableError(`Аргумент ${index + 1} функции «${expression.name}» должен иметь тип ${typeName(expected)}, получен ${typeName(actual)}.`, argument.line, argument.column);
    });
    if (!fn.returnType) inferFunction(fn, context);
    return fn.returnType;
  }
  if (expression.kind === 'unary') {
    const type = typeOf(expression.value, symbols, context);
    if (expression.operator === 'not') {
      if (type !== 'bool' && type !== 'any') throw new FableError('Оператор not можно применять только к bool.', expression.line, expression.column);
      return 'bool';
    }
    if (type === 'any') return 'any';
    if (!numeric(type)) throw new FableError('Унарный минус можно применять только к числу.', expression.line, expression.column);
    return type;
  }
  const left = typeOf(expression.left, symbols, context);
  const right = typeOf(expression.right, symbols, context);
  if (expression.operator === 'and' || expression.operator === 'or') {
    if (left !== 'bool' || right !== 'bool') throw new FableError(`Оператор ${expression.operator} требует значения bool.`, expression.line, expression.column);
    return 'bool';
  }
  if (expression.operator === '==' || expression.operator === '!=') {
    if (left === 'any' || right === 'any') return 'bool';
    if (!sameType(left, right) && !(numeric(left) && numeric(right))) throw new FableError(`Нельзя сравнить типы ${typeName(left)} и ${typeName(right)}.`, expression.line, expression.column);
    if (typeof left !== 'string' || typeof right !== 'string') throw new FableError('Сравнение коллекций пока не поддерживается.', expression.line, expression.column);
    return 'bool';
  }
  if (['<', '>', '<=', '>='].includes(expression.operator)) {
    if (left === 'any' || right === 'any') return 'bool';
    if (!numeric(left) || !numeric(right)) throw new FableError(`Оператор ${expression.operator} требует числа.`, expression.line, expression.column);
    return 'bool';
  }
  if (left === 'any' || right === 'any') return 'any';
  if (expression.operator === '+' && left === 'string' && right === 'string') return 'string';
  if (!numeric(left) || !numeric(right)) throw new FableError(`Операция «${expression.operator}» не поддерживает типы ${typeName(left)} и ${typeName(right)}.`, expression.line, expression.column);
  return expression.operator === '/' || left === 'float' || right === 'float' ? 'float' : 'int';
}

function mergeReturnTypes(types, line, column) {
  if (!types.length) return 'void';
  let result = types[0];
  for (const type of types.slice(1)) {
    if (sameType(type, result)) continue;
    if (numeric(type) && numeric(result)) result = 'float';
    else throw new FableError(`Функция возвращает несовместимые типы ${result} и ${type}.`, line, column);
  }
  return result;
}

function inferFunction(fn, context) {
  if (fn.checked) return fn.returnType;
  if (fn.checking) {
    if (fn.returnType) return fn.returnType;
    throw new FableError(`Для рекурсивной функции «${fn.name}» нужно указать тип после ->.`, fn.line, fn.column);
  }
  fn.checking = true;
  const symbols = new Map(fn.parameters.map((parameter) => [parameter.name, parameter.type]));
  if (fn.ownerClass) symbols.set('self', fn.ownerClass);
  const returns = [];
  checkBlock(fn.body, symbols, { ...context, currentFunction: fn }, returns);
  const inferred = mergeReturnTypes(returns, fn.line, fn.column);
  if (fn.declaredReturnType) {
    if (!returns.length) throw new FableError(`Функция «${fn.name}» должна возвращать ${fn.declaredReturnType}.`, fn.line, fn.column);
    if (!assignable(fn.declaredReturnType, inferred)) throw new FableError(`Функция «${fn.name}» объявлена как ${fn.declaredReturnType}, но возвращает ${inferred}.`, fn.line, fn.column);
    fn.returnType = fn.declaredReturnType;
  } else fn.returnType = inferred;
  fn.checking = false;
  fn.checked = true;
  return fn.returnType;
}

function checkBlock(program, symbols, context, returns = []) {
  for (const statement of program) {
    if (statement.kind === 'function' || statement.kind === 'class') continue;
    if (statement.kind === 'import') {
      if (symbols.has(statement.name)) throw new FableError(`Имя «${statement.name}» уже используется.`, statement.line, statement.column);
      symbols.set(statement.name, { kind: 'module', name: statement.name });
    } else if (statement.kind === 'declaration') {
      if (symbols.has(statement.name)) throw new FableError(`Переменная «${statement.name}» уже объявлена.`, statement.line, statement.nameColumn);
      const actual = typeOf(statement.expression, symbols, context);
      const target = statement.declaredType === 'var' ? actual : declaredType(statement.declaredType);
      if (!assignable(target, actual)) throw new FableError(`Нельзя присвоить значение типа ${typeName(actual)} переменной типа ${typeName(target)}.`, statement.line, statement.nameColumn);
      symbols.set(statement.name, target);
    } else if (statement.kind === 'assignment') {
      if (!symbols.has(statement.name)) throw new FableError(`Переменная «${statement.name}» не объявлена.`, statement.line, statement.nameColumn);
      const target = symbols.get(statement.name);
      const actual = typeOf(statement.expression, symbols, context);
      if (!assignable(target, actual)) throw new FableError(`Нельзя присвоить значение типа ${typeName(actual)} переменной типа ${typeName(target)}.`, statement.line, statement.nameColumn);
    } else if (statement.kind === 'memberAssignment') {
      const object = typeOf(statement.object, symbols, context);
      const actual = typeOf(statement.expression, symbols, context);
      if (typeof object === 'string' || !['instance', 'table'].includes(object.kind)) throw new FableError('Присваивание через точку доступно только объектам и таблицам.', statement.line, statement.column);
      if (!object.fields.has(statement.name)) throw new FableError(`Нет поля или ключа «${statement.name}».`, statement.line, statement.column);
      const expected = object.fields.get(statement.name);
      if (!assignable(expected, actual)) throw new FableError(`Поле «${statement.name}» ожидает ${typeName(expected)}, получен ${typeName(actual)}.`, statement.line, statement.column);
    } else if (statement.kind === 'if') {
      const conditionType = typeOf(statement.condition, symbols, context);
      if (conditionType !== 'bool') throw new FableError('Условие if должно иметь тип bool.', statement.line, statement.column);
      checkBlock(statement.thenBranch, new Map(symbols), context, returns);
      checkBlock(statement.elseBranch, new Map(symbols), context, returns);
    } else if (statement.kind === 'while') {
      const conditionType = typeOf(statement.condition, symbols, context);
      if (conditionType !== 'bool') throw new FableError('Условие while должно иметь тип bool.', statement.line, statement.column);
      checkBlock(statement.body, new Map(symbols), context, returns);
    } else if (statement.kind === 'repeat') {
      const countType = typeOf(statement.count, symbols, context);
      if (countType !== 'int') throw new FableError('Количество повторений должно иметь тип int.', statement.line, statement.column);
      checkBlock(statement.body, new Map(symbols), context, returns);
    } else if (statement.kind === 'for') {
      if (symbols.has(statement.name)) throw new FableError(`Переменная «${statement.name}» уже объявлена.`, statement.line, statement.column);
      const collectionType = typeOf(statement.collection, symbols, context);
      let itemType;
      if (typeof collectionType !== 'string' && collectionType.kind === 'list') itemType = collectionType.element;
      else if (typeof collectionType !== 'string' && collectionType.kind === 'table') itemType = 'string';
      else throw new FableError('Цикл for работает со списком или таблицей.', statement.line, statement.column);
      const loopSymbols = new Map(symbols);
      loopSymbols.set(statement.name, itemType);
      checkBlock(statement.body, loopSymbols, context, returns);
    } else if (statement.kind === 'return') {
      if (!context.currentFunction) throw new FableError('return можно использовать только внутри функции.', statement.line, statement.column);
      const actual = statement.expression ? typeOf(statement.expression, symbols, context) : 'void';
      if (context.currentFunction.declaredReturnType && !assignable(context.currentFunction.declaredReturnType, actual)) {
        throw new FableError(`Ожидался тип ${typeName(context.currentFunction.declaredReturnType)}, получен ${typeName(actual)}.`, statement.line, statement.column);
      }
      returns.push(actual);
    } else {
      const type = typeOf(statement.expression, symbols, context);
      if (statement.kind === 'print' && type === 'void') throw new FableError('Нельзя вывести результат функции без возвращаемого значения.', statement.line, statement.column);
    }
  }
  return symbols;
}

function check(program) {
  const functions = new Map();
  const classes = new Map();
  for (const statement of program) {
    if (statement.kind !== 'class') continue;
    if (classes.has(statement.name)) throw new FableError(`Класс «${statement.name}» уже объявлен.`, statement.line, statement.column);
    const fields = new Map();
    for (const field of statement.fields) {
      if (fields.has(field.name)) throw new FableError(`Поле «${field.name}» уже объявлено.`, field.line, field.column);
      fields.set(field.name, field.type);
    }
    const classInfo = { kind: 'instance', name: statement.name, fields, methods: new Map(), constructor: null, node: statement };
    for (const methodNode of statement.methods) {
      if (classInfo.methods.has(methodNode.name)) throw new FableError(`Метод «${methodNode.name}» уже объявлен.`, methodNode.line, methodNode.column);
      classInfo.methods.set(methodNode.name, { ...methodNode, returnType: methodNode.declaredReturnType, checking: false, checked: false, ownerClass: classInfo });
    }
    if (statement.constructor) classInfo.constructor = { ...statement.constructor, returnType: null, checking: false, checked: false, ownerClass: classInfo };
    classes.set(statement.name, classInfo);
  }
  for (const statement of program) {
    if (statement.kind !== 'function') continue;
    if (functions.has(statement.name)) throw new FableError(`Функция «${statement.name}» уже объявлена.`, statement.line, statement.column);
    functions.set(statement.name, {
      ...statement,
      returnType: statement.declaredReturnType,
      checking: false,
      checked: false,
    });
  }
  const context = { functions, classes, currentFunction: null };
  for (const fn of functions.values()) inferFunction(fn, context);
  for (const classInfo of classes.values()) {
    if (classInfo.constructor) inferFunction(classInfo.constructor, context);
    for (const method of classInfo.methods.values()) inferFunction(method, context);
  }
  checkBlock(program, new Map(), context);
  return { functions, classes };
}

function invokeFunctionNode(fn, argumentValues, runtime, selfValue, functions, classes) {
  const localValues = new Map(fn.__values ?? []);
  if (selfValue !== undefined) localValues.set('self', selfValue);
  fn.parameters.forEach((parameter, index) => localValues.set(parameter.name, argumentValues[index]));
  const previousFunctions = runtime.functions;
  const previousClasses = runtime.classes;
  runtime.functions = functions;
  runtime.classes = classes;
  try {
    return executeBlock(fn.body, localValues, runtime, false)?.value;
  } finally {
    runtime.functions = previousFunctions;
    runtime.classes = previousClasses;
  }
}

function instantiateClassNode(classNode, argumentValues, runtime, functions, classes) {
  const instance = Object.create(null);
  Object.defineProperties(instance, {
    __className: { value: classNode.name, enumerable: false },
    __functions: { value: functions, enumerable: false },
    __classes: { value: classes, enumerable: false },
  });
  for (const field of classNode.fields) instance[field.name] = undefined;
  if (classNode.constructor) invokeFunctionNode(classNode.constructor, argumentValues, runtime, instance, functions, classes);
  return instance;
}

function evaluate(expression, values, runtime) {
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'identifier') return values.get(expression.name);
  if (expression.kind === 'list') return expression.elements.map((item) => evaluate(item, values, runtime));
  if (expression.kind === 'table') {
    const table = Object.create(null);
    for (const entry of expression.entries) table[entry.key] = evaluate(entry.value, values, runtime);
    return table;
  }
  if (expression.kind === 'index') {
    const collection = evaluate(expression.object, values, runtime);
    const index = evaluate(expression.index, values, runtime);
    if (index < 0 || index >= collection.length) throw new FableError(`Индекс ${index} находится вне списка.`, expression.line, expression.column);
    return collection[index];
  }
  if (expression.kind === 'member') {
    const object = evaluate(expression.object, values, runtime);
    if (expression.name === 'len') return Array.isArray(object) || typeof object === 'string' ? object.length : Object.keys(object).length;
    return object[expression.name];
  }
  if (expression.kind === 'methodCall') {
    const collection = evaluate(expression.object, values, runtime);
    const argumentValues = expression.args.map((argument) => evaluate(argument, values, runtime));
    if (collection && collection.__module) {
      if (collection.__functions.has(expression.name)) {
        return invokeFunctionNode(collection.__functions.get(expression.name), argumentValues, runtime, undefined, collection.__runtimeFunctions, collection.__runtimeClasses);
      }
      if (collection.__classes.has(expression.name)) {
        return instantiateClassNode(collection.__classes.get(expression.name), argumentValues, runtime, collection.__runtimeFunctions, collection.__runtimeClasses);
      }
      throw new FableError(`В модуле нет функции или класса «${expression.name}».`, expression.line, expression.column);
    }
    if (collection && collection.__className) {
      const classNode = collection.__classes.get(collection.__className);
      const method = classNode.methods.find((candidate) => candidate.name === expression.name);
      if (!method) throw new FableError(`В классе «${collection.__className}» нет метода «${expression.name}».`, expression.line, expression.column);
      return invokeFunctionNode(method, argumentValues, runtime, collection, collection.__functions, collection.__classes);
    }
    const value = argumentValues[0];
    if (expression.name === 'add') {
      collection.push(value);
      return undefined;
    }
    const index = collection.indexOf(value);
    if (index < 0) return false;
    collection.splice(index, 1);
    return true;
  }
  if (expression.kind === 'call') {
    const fn = runtime.functions.get(expression.name);
    const argumentValues = expression.args.map((argument) => evaluate(argument, values, runtime));
    if (!fn) {
      const classNode = runtime.classes.get(expression.name);
      return instantiateClassNode(classNode, argumentValues, runtime, runtime.functions, runtime.classes);
    }
    return invokeFunctionNode(fn, argumentValues, runtime, undefined, runtime.functions, runtime.classes);
  }
  if (expression.kind === 'unary') {
    const value = evaluate(expression.value, values, runtime);
    return expression.operator === 'not' ? !value : -value;
  }
  if (expression.operator === 'and') return evaluate(expression.left, values, runtime) && evaluate(expression.right, values, runtime);
  if (expression.operator === 'or') return evaluate(expression.left, values, runtime) || evaluate(expression.right, values, runtime);
  const left = evaluate(expression.left, values, runtime);
  const right = evaluate(expression.right, values, runtime);
  return {
    '+': () => left + right, '-': () => left - right, '*': () => left * right, '/': () => left / right,
    '==': () => left === right, '!=': () => left !== right,
    '<': () => left < right, '>': () => left > right, '<=': () => left <= right, '>=': () => left >= right,
  }[expression.operator]();
}

function formatValue(value) {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) return JSON.stringify(value);
  return String(value);
}

function executeBlock(program, values, runtime, scoped) {
  const declaredHere = [];
  for (const statement of program) {
    runtime.steps += 1;
    if (runtime.steps > runtime.maxSteps) throw new FableError('Превышен предел выполнения цикла.', statement.line, statement.column);
    if (statement.kind === 'function' || statement.kind === 'class') continue;
    if (statement.kind === 'import') {
      values.set(statement.name, loadImportedModule(statement.name, runtime, statement));
      declaredHere.push(statement.name);
    } else if (statement.kind === 'declaration') {
      values.set(statement.name, evaluate(statement.expression, values, runtime));
      declaredHere.push(statement.name);
    } else if (statement.kind === 'assignment') values.set(statement.name, evaluate(statement.expression, values, runtime));
    else if (statement.kind === 'memberAssignment') {
      const object = evaluate(statement.object, values, runtime);
      object[statement.name] = evaluate(statement.expression, values, runtime);
    }
    else if (statement.kind === 'if') {
      const branch = evaluate(statement.condition, values, runtime) ? statement.thenBranch : statement.elseBranch;
      const result = executeBlock(branch, values, runtime, true);
      if (result?.returned) {
        if (scoped) for (const name of declaredHere) values.delete(name);
        return result;
      }
    } else if (statement.kind === 'while') {
      while (evaluate(statement.condition, values, runtime)) {
        runtime.steps += 1;
        if (runtime.steps > runtime.maxSteps) throw new FableError('Превышен предел выполнения цикла.', statement.line, statement.column);
        const result = executeBlock(statement.body, values, runtime, true);
        if (result?.returned) {
          if (scoped) for (const name of declaredHere) values.delete(name);
          return result;
        }
      }
    } else if (statement.kind === 'repeat') {
      const count = evaluate(statement.count, values, runtime);
      if (count < 0) throw new FableError('Количество повторений не может быть отрицательным.', statement.line, statement.column);
      for (let iteration = 0; iteration < count; iteration += 1) {
        runtime.steps += 1;
        if (runtime.steps > runtime.maxSteps) throw new FableError('Превышен предел выполнения цикла.', statement.line, statement.column);
        const result = executeBlock(statement.body, values, runtime, true);
        if (result?.returned) {
          if (scoped) for (const name of declaredHere) values.delete(name);
          return result;
        }
      }
    } else if (statement.kind === 'for') {
      const collection = evaluate(statement.collection, values, runtime);
      const items = Array.isArray(collection) ? collection : Object.keys(collection);
      for (const item of items) {
        runtime.steps += 1;
        if (runtime.steps > runtime.maxSteps) throw new FableError('Превышен предел выполнения цикла.', statement.line, statement.column);
        values.set(statement.name, item);
        const result = executeBlock(statement.body, values, runtime, true);
        if (result?.returned) {
          values.delete(statement.name);
          if (scoped) for (const name of declaredHere) values.delete(name);
          return result;
        }
      }
      values.delete(statement.name);
    } else if (statement.kind === 'return') {
      const result = { returned: true, value: statement.expression ? evaluate(statement.expression, values, runtime) : undefined };
      if (scoped) for (const name of declaredHere) values.delete(name);
      return result;
    } else if (statement.kind === 'print') runtime.output(formatValue(evaluate(statement.expression, values, runtime)));
    else evaluate(statement.expression, values, runtime);
  }
  if (scoped) for (const name of declaredHere) values.delete(name);
  return null;
}

function definitionMaps(program) {
  return {
    functions: new Map(program.filter((statement) => statement.kind === 'function').map((fn) => [fn.name, fn])),
    classes: new Map(program.filter((statement) => statement.kind === 'class').map((classNode) => [classNode.name, classNode])),
  };
}

function bindDefinitionValues(functions, classes, values) {
  for (const fn of functions.values()) fn.__values = values;
  for (const classNode of classes.values()) {
    if (classNode.constructor) classNode.constructor.__values = values;
    for (const method of classNode.methods) method.__values = values;
  }
}

function executeModuleSource(source, filePath, runtime) {
  const cacheKey = filePath || '<main>';
  if (runtime.moduleCache.has(cacheKey)) return runtime.moduleCache.get(cacheKey);
  if (runtime.loadingModules.has(cacheKey)) throw new FableError(`Циклический import: модуль «${filePath}» уже загружается.`, 1, 1);
  runtime.loadingModules.add(cacheKey);

  const previousFunctions = runtime.functions;
  const previousClasses = runtime.classes;
  const previousFile = runtime.currentFile;
  try {
    const program = parse(source);
    check(program);
    const { functions, classes } = definitionMaps(program);
    const values = new Map();
    bindDefinitionValues(functions, classes, values);
    runtime.functions = functions;
    runtime.classes = classes;
    runtime.currentFile = filePath;
    executeBlock(program, values, runtime, false);

    const exportedFunctions = new Map([...functions].filter(([name]) => !name.startsWith('_')));
    const exportedClasses = new Map([...classes].filter(([name]) => !name.startsWith('_')));
    const namespace = Object.create(null);
    Object.defineProperties(namespace, {
      __module: { value: true, enumerable: false },
      __functions: { value: exportedFunctions, enumerable: false },
      __classes: { value: exportedClasses, enumerable: false },
      __runtimeFunctions: { value: functions, enumerable: false },
      __runtimeClasses: { value: classes, enumerable: false },
    });
    for (const [name, value] of values) if (!name.startsWith('_')) namespace[name] = value;
    runtime.moduleCache.set(cacheKey, namespace);
    return namespace;
  } catch (error) {
    if (error instanceof FableError && !error.filePath) error.filePath = filePath;
    throw error;
  } finally {
    runtime.functions = previousFunctions;
    runtime.classes = previousClasses;
    runtime.currentFile = previousFile;
    runtime.loadingModules.delete(cacheKey);
  }
}

function loadImportedModule(name, runtime, statement) {
  if (!runtime.loadModule) throw new FableError(`Модуль «${name}» нельзя загрузить: загрузчик модулей не настроен.`, statement.line, statement.column);
  try {
    const loaded = runtime.loadModule(name, runtime.currentFile);
    if (!loaded || typeof loaded.source !== 'string' || !loaded.filePath) throw new Error('Загрузчик не вернул файл модуля.');
    return executeModuleSource(loaded.source, loaded.filePath, runtime);
  } catch (error) {
    if (error instanceof FableError) throw error;
    const problem = new FableError(`Не удалось загрузить модуль «${name}»: ${error.message}`, statement.line, statement.column);
    problem.filePath = runtime.currentFile;
    throw problem;
  }
}

function run(source, output = console.log, options = {}) {
  const runtime = {
    functions: new Map(),
    classes: new Map(),
    output,
    steps: 0,
    maxSteps: options.maxSteps ?? 100000,
    loadModule: options.loadModule,
    currentFile: options.filePath,
    moduleCache: new Map(),
    loadingModules: new Set(),
  };
  executeModuleSource(source, options.filePath, runtime);
}

function validate(source) {
  try { check(parse(source)); return []; }
  catch (error) { if (error instanceof FableError) return [error]; throw error; }
}

module.exports = { FableError, parse, check, run, validate };
