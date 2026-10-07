'use strict';

function callableBefore(source, offset) {
  const match = source.slice(0, offset).match(/([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s*$/);
  if (!match) return null;
  return match[2]
    ? { receiver: match[1], name: match[2] }
    : { receiver: null, name: match[1] };
}

function activeParameterFromText(source) {
  const tokens = [];
  const closing = [];
  let quote = null;
  let escaped = false;
  let lineComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      if (closing.length === 0) tokens.push({ type: 'atom' });
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      if (closing.length === 0) tokens.push({ type: 'nested' });
      closing.push(character === '(' ? ')' : character === '[' ? ']' : '}');
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (closing.at(-1) === character) closing.pop();
      continue;
    }
    if (closing.length > 0 || /\s/.test(character)) continue;
    if (character === ',') {
      tokens.push({ type: 'comma' });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      tokens.push({ type: ['and', 'or', 'not'].includes(identifier) ? 'operator' : 'atom', value: identifier });
      index += identifier.length - 1;
      continue;
    }
    const number = source.slice(index).match(/^\d+(?:\.\d+)?/)?.[0];
    if (number) {
      tokens.push({ type: 'atom' });
      index += number.length - 1;
      continue;
    }
    if (character === '.') tokens.push({ type: 'dot' });
    else if ('+-*/%<>=!'.includes(character)) {
      tokens.push({ type: 'operator', value: character });
      if ('=<>!'.includes(character) && next === '=') index += 1;
    }
  }

  let activeParameter = 0;
  let expectingOperand = true;
  for (const token of tokens) {
    if (token.type === 'comma') {
      activeParameter += 1;
      expectingOperand = true;
    } else if (token.type === 'dot') {
      expectingOperand = true;
    } else if (token.type === 'operator') {
      if (token.value === 'not' && !expectingOperand) activeParameter += 1;
      expectingOperand = true;
    } else if (token.type === 'nested') {
      if (expectingOperand) expectingOperand = false;
    } else {
      if (!expectingOperand) activeParameter += 1;
      expectingOperand = false;
    }
  }
  return activeParameter;
}

function findActiveCall(source, offset = source.length) {
  const stack = [];
  let quote = null;
  let escaped = false;
  let lineComment = false;

  for (let index = 0; index < Math.min(offset, source.length); index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '(') {
      const callable = callableBefore(source, index);
      stack.push(callable
        ? { type: 'call', closing: ')', ...callable, openOffset: index, activeParameter: 0 }
        : { type: 'group', closing: ')' });
      continue;
    }
    if (character === '[' || character === '{') {
      stack.push({ type: 'group', closing: character === '[' ? ']' : '}' });
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        const entry = stack.pop();
        if (entry.closing === character) break;
      }
      continue;
    }
    if (character === ',' && stack.at(-1)?.type === 'call') {
      stack.at(-1).activeParameter += 1;
    }
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].type === 'call') {
      const result = { ...stack[index] };
      result.activeParameter = activeParameterFromText(source.slice(result.openOffset + 1, offset));
      delete result.openOffset;
      return result;
    }
  }
  return null;
}

function parameterLabel(parameter) {
  if (typeof parameter === 'string') return parameter;
  if (!parameter || typeof parameter !== 'object') return String(parameter ?? 'value');
  if (!parameter.type || parameter.type === 'any') return parameter.name;
  return `${parameter.type} ${parameter.name}`;
}

function parameterName(parameter) {
  if (typeof parameter === 'string') return parameter;
  return parameter?.name || 'value';
}

function callableParameters(member) {
  if (member?.kind === 'class') return member.constructor?.parameters || [];
  return member?.parameters || [];
}

function signatureModels(name, member) {
  const required = callableParameters(member).map(parameterLabel);
  const optional = (member?.optionalParameters || []).map(parameterLabel);
  const variants = [{
    label: `${name}(${required.join(', ')})`,
    parameters: required,
    detail: member?.detail,
  }];
  if (optional.length > 0) {
    const all = [...required, ...optional];
    variants.push({
      label: `${name}(${all.join(', ')})`,
      parameters: all,
      detail: member?.detail,
    });
  }
  return variants;
}

function splitDeclarationParameters(source) {
  const tokens = source.split(/[\s,]+/).filter(Boolean);
  const parameters = [];
  for (let index = 0; index < tokens.length;) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (next && ['int', 'float', 'string', 'bool', 'any'].includes(current)) {
      parameters.push({ type: current, name: next });
      index += 2;
    } else {
      parameters.push({ type: 'any', name: current });
      index += 1;
    }
  }
  return parameters;
}

function findSourceCallable(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const functionMatch = new RegExp(`^\\s*func\\s+${escapedName}\\s*\\(([^)]*)\\)`, 'm').exec(source);
  if (functionMatch) {
    return { kind: 'function', name, parameters: splitDeclarationParameters(functionMatch[1]), detail: 'Функция из текущего файла' };
  }
  const constructorMatch = new RegExp(`^\\s*__init\\s*\\(([^)]*)\\)`, 'm').exec(source);
  const classMatch = new RegExp(`^\\s*class\\s+${escapedName}\\b`, 'm').exec(source);
  if (classMatch && constructorMatch && constructorMatch.index > classMatch.index) {
    return {
      kind: 'class',
      name,
      constructor: { parameters: splitDeclarationParameters(constructorMatch[1]) },
      detail: 'Класс из текущего файла',
    };
  }
  return null;
}

module.exports = {
  activeParameterFromText,
  callableParameters,
  findActiveCall,
  findSourceCallable,
  parameterLabel,
  parameterName,
  signatureModels,
  splitDeclarationParameters,
};
