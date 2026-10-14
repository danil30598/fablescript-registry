'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { collectSymbols, hoverText, identifierOccurrences, receiverType } = require('../vscode-extension/language-service');

test('collects declarations and infers common variable types', () => {
  const source = 'var title = "Fable"\nvar values = [1, 2]\nvar data = {a: 1}\nfunc sum(int a int b) -> int {\n}\nclass Player\n{\n}\n';
  const symbols = collectSymbols(source);
  assert.equal(receiverType(source, 'title'), 'string');
  assert.equal(receiverType(source, 'values'), 'list');
  assert.equal(receiverType(source, 'data'), 'table');
  assert.equal(symbols.find((item) => item.name === 'sum').kind, 'function');
  assert.match(hoverText(source, 'a', source.length), /int a/);
  assert.equal(hoverText(source, 'print', 0), 'func print(value)');
});

test('finds rename occurrences outside strings, comments, members, and table keys', () => {
  const source = 'var score = 1\nscore = score + player.score\nvar text = "score"\n// score\nvar data = {score: score}';
  assert.equal(identifierOccurrences(source, 'score').length, 4);
});
