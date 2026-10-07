'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { run } = require('../runtime/engine');
const { createModuleLoader } = require('../runtime/module-loader');
const { createJsonModule } = require('../runtime/native-modules/json');

const json = createJsonModule();
assert.deepEqual(json.parse('{"name":"Alex","scores":[7,9]}'), { name: 'Alex', scores: [7, 9] });
assert.equal(json.stringify({ active: true }), '{"active":true}');
assert.match(json.pretty({ active: true }), /\n  "active": true\n/);
assert.throws(() => json.parse('{broken'), /Некорректный JSON/);
assert.throws(() => json.parse(12), /ожидает строку/);

const output = [];
const entryPath = path.join(__dirname, 'json-example.fable');
run(`
  import json
  var source = {name: "Alex", scores: [7, 9]}
  string encoded = json.stringify(source)
  var data = json.parse(encoded)
  print(data.name)
  print(data.scores[1])
  print(data.scores.len)
`, (value) => output.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
assert.deepEqual(output, ['Alex', '9', '2']);

const caught = [];
run(`
  import json
  try {
    json.parse("{broken")
  } catch error {
    print(error)
  }
`, (value) => caught.push(value), { filePath: entryPath, loadModule: createModuleLoader(entryPath) });
assert.match(caught[0], /Ошибка json.parse: Некорректный JSON/);

console.log('json module tests passed');
