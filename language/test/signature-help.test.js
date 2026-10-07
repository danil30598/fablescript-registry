'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  activeParameterFromText,
  callableParameters,
  findActiveCall,
  findSourceCallable,
  parameterLabel,
  parameterName,
  signatureModels,
  splitDeclarationParameters,
} = require('../vscode-extension/signature-help.js');

test('finds a module call and counts its current argument', () => {
  assert.deepEqual(findActiveCall('window.rect(10, 20, '), {
    type: 'call',
    closing: ')',
    receiver: 'window',
    name: 'rect',
    activeParameter: 2,
  });
});

test('ignores commas inside strings, lists, tables, and nested calls', () => {
  assert.equal(findActiveCall('file.write("save,1.json", json.stringify({a: [1, 2]}), ').activeParameter, 2);
  assert.deepEqual(findActiveCall('print(range(1, '), {
    type: 'call',
    closing: ')',
    receiver: null,
    name: 'range',
    activeParameter: 1,
  });
});

test('ignores calls inside comments and returns the surrounding call', () => {
  const source = 'print(1, // fake(1, 2)\n 2';
  assert.equal(findActiveCall(source).name, 'print');
  assert.equal(findActiveCall(source).activeParameter, 1);
});

test('tracks arguments separated by spaces as allowed by FableScript', () => {
  assert.equal(findActiveCall('sum(2 ').activeParameter, 0);
  assert.equal(findActiveCall('sum(2 3').activeParameter, 1);
  assert.equal(findActiveCall('sum(number - 1 other').activeParameter, 1);
  assert.equal(activeParameterFromText('value and not ready next'), 1);
});

test('formats required and optional signatures', () => {
  assert.deepEqual(signatureModels('file.write', {
    parameters: ['path', 'value'],
    optionalParameters: ['protocol', 'password'],
    detail: 'write',
  }), [
    { label: 'file.write(path, value)', parameters: ['path', 'value'], detail: 'write' },
    { label: 'file.write(path, value, protocol, password)', parameters: ['path', 'value', 'protocol', 'password'], detail: 'write' },
  ]);
});

test('understands typed and untyped FableScript parameters', () => {
  assert.deepEqual(splitDeclarationParameters('int a, b string title'), [
    { type: 'int', name: 'a' },
    { type: 'any', name: 'b' },
    { type: 'string', name: 'title' },
  ]);
  assert.equal(parameterLabel({ type: 'int', name: 'count' }), 'int count');
  assert.equal(parameterLabel({ type: 'any', name: 'value' }), 'value');
  assert.equal(parameterName({ type: 'int', name: 'count' }), 'count');
});

test('finds functions and class constructors in an unfinished source file', () => {
  const source = `
func sum(int a int b)
{
  return a + b
}

class Person
{
  __init(name, int age)
  {
    self.name = name
    self.age = age
  }
}

sum(`;
  const sum = findSourceCallable(source, 'sum');
  assert.equal(signatureModels('sum', sum)[0].label, 'sum(int a, int b)');
  const person = findSourceCallable(source, 'Person');
  assert.equal(signatureModels('Person', person)[0].label, 'Person(name, int age)');
  assert.deepEqual(callableParameters(person), [
    { type: 'any', name: 'name' },
    { type: 'int', name: 'age' },
  ]);
});
