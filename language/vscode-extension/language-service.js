'use strict';

const KEYWORDS = new Set([
  'var', 'int', 'float', 'string', 'bool', 'any', 'list', 'func', 'class', '__init', 'self',
  'if', 'else', 'while', 'repeat', 'times', 'for', 'in', 'return', 'break', 'continue',
  'try', 'catch', 'import', 'true', 'false', 'null', 'and', 'or', 'not',
]);

const BUILTINS = new Map([
  ['print', 'func print(value)'], ['input', 'func input(prompt) -> string'],
  ['int', 'func int(value) -> int'], ['float', 'func float(value) -> float'],
  ['string', 'func string(value) -> string'], ['bool', 'func bool(value) -> bool'],
  ['range', 'func range(start, end, step) -> list<int>'], ['execute', 'func execute(file, function, arguments) -> any'],
]);

function maskedSource(source) {
  let result = '';
  let quote = null;
  let escaped = false;
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === '\n') {
        comment = false;
        result += '\n';
      } else result += ' ';
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      result += character === '\n' ? '\n' : ' ';
      continue;
    }
    if (character === '/' && next === '/') {
      comment = true;
      result += '  ';
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += ' ';
      continue;
    }
    result += character;
  }
  return result;
}

function inferExpressionType(expression, known = new Map()) {
  const value = expression.trim();
  if (/^["']/.test(value)) return 'string';
  if (/^(true|false)\b/.test(value)) return 'bool';
  if (/^-?\d+$/.test(value)) return 'int';
  if (/^-?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) return 'float';
  if (/^\[/.test(value)) return 'list';
  if (/^\{/.test(value)) return 'table';
  if (/^null\b/.test(value)) return 'any';
  const identifier = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
  return known.get(identifier)?.type || 'any';
}

function collectSymbols(source) {
  const masked = maskedSource(source);
  const symbols = [];
  const known = new Map();
  const add = (name, kind, type, offset, detail) => {
    const symbol = { name, kind, type, offset, detail };
    symbols.push(symbol);
    known.set(name, symbol);
  };
  let match;
  const declarations = /^\s*(var|int|float|string|bool|any|list<(?:int|float|string|bool|any)>)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^\r\n]+))?/gm;
  while ((match = declarations.exec(source)) !== null) {
    const nameOffset = match.index + match[0].indexOf(match[2]);
    const originalExpression = match[3] || '';
    const type = match[1] === 'var' ? inferExpressionType(originalExpression, known) : match[1];
    add(match[2], 'variable', type, nameOffset, `${type} ${match[2]}`);
  }
  const functions = /^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*->\s*(int|float|string|bool))?/gm;
  while ((match = functions.exec(masked)) !== null) {
    const offset = match.index + match[0].indexOf(match[1]);
    const parameters = match[2].trim();
    add(match[1], 'function', match[3] || 'any', offset, `func ${match[1]}(${parameters})${match[3] ? ` -> ${match[3]}` : ''}`);
    const parameterPattern = /(?:(int|float|string|bool|any)\s+)?([A-Za-z_][A-Za-z0-9_]*)/g;
    let parameter;
    const parametersStart = match.index + match[0].indexOf(match[2]);
    while ((parameter = parameterPattern.exec(match[2])) !== null) add(parameter[2], 'parameter', parameter[1] || 'any', parametersStart + parameter.index + parameter[0].lastIndexOf(parameter[2]), `${parameter[1] || 'any'} ${parameter[2]}`);
  }
  const classes = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  while ((match = classes.exec(masked)) !== null) add(match[1], 'class', match[1], match.index + match[0].lastIndexOf(match[1]), `class ${match[1]}`);
  const imports = /^\s*import\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  while ((match = imports.exec(masked)) !== null) add(match[1], 'module', `module ${match[1]}`, match.index + match[0].lastIndexOf(match[1]), `import ${match[1]}`);
  return symbols.sort((a, b) => a.offset - b.offset);
}

function symbolAt(source, name, offset = source.length) {
  const candidates = collectSymbols(source).filter((symbol) => symbol.name === name);
  return [...candidates].reverse().find((symbol) => symbol.offset <= offset) || candidates[0] || null;
}

function hoverText(source, name, offset) {
  const symbol = symbolAt(source, name, offset);
  return symbol?.detail || BUILTINS.get(name) || (KEYWORDS.has(name) ? `keyword ${name}` : null);
}

function identifierOccurrences(source, name) {
  const masked = maskedSource(source);
  const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const results = [];
  let match;
  while ((match = pattern.exec(masked)) !== null) {
    const before = masked.slice(0, match.index).match(/\S\s*$/)?.[0].trim();
    const after = masked.slice(match.index + name.length).match(/^\s*./)?.[0].trim();
    if (before === '.' || (after === ':' && before !== '?')) continue;
    results.push({ offset: match.index, length: name.length });
  }
  return results;
}

function receiverType(source, name, offset) {
  return symbolAt(source, name, offset)?.type || 'any';
}

module.exports = { BUILTINS, KEYWORDS, collectSymbols, hoverText, identifierOccurrences, inferExpressionType, maskedSource, receiverType, symbolAt };
