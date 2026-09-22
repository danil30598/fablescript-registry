'use strict';

const assert = require('node:assert/strict');
const { run, validate } = require('../runtime/engine');

const output = [];
run(`
  var greeting = "hello"
  int answer = 2 + 3 * 4;
  answer = answer + 1
  print(greeting)
  print(answer)
`, (value) => output.push(value));
assert.deepEqual(output, ['hello', '15']);

const errors = validate('unknown()');
assert.equal(errors.length, 1);
assert.equal(errors[0].line, 1);
assert.match(errors[0].message, /Функция или класс.*не объявлены/);

const typeErrors = validate('var age = 18\nage = "много"');
assert.equal(typeErrors.length, 1);
assert.match(typeErrors[0].message, /типа string.*типа int/);

const undeclaredErrors = validate('print(missing)');
assert.equal(undeclaredErrors.length, 1);
assert.match(undeclaredErrors[0].message, /не объявлена/);

const explicitOutput = [];
run('float value = 2\nstring text = "Fa" + "ble"\nbool ready = true\nprint(value)\nprint(text)\nprint(ready)',
  (value) => explicitOutput.push(value));
assert.deepEqual(explicitOutput, ['2', 'Fable', 'true']);

const conditionOutput = [];
run(`
  var age = 18
  var allowed = true
  if age >= 18 and allowed {
    print("yes")
    age = age + 1
  } else {
    print("no")
  }
  if age != 18 {
    print(age)
  }
`, (value) => conditionOutput.push(value));
assert.deepEqual(conditionOutput, ['yes', '19']);

const elseOutput = [];
run('var age = 10\nif age >= 18 {\nprint("adult")\n} else {\nprint("child")\n}',
  (value) => elseOutput.push(value));
assert.deepEqual(elseOutput, ['child']);

const conditionTypeErrors = validate('if 42 {\nprint("never")\n}');
assert.equal(conditionTypeErrors.length, 1);
assert.match(conditionTypeErrors[0].message, /тип bool/);

const wordsOutput = [];
run('var ready = false\nif not ready or ready {\nprint("words")\n}',
  (value) => wordsOutput.push(value));
assert.deepEqual(wordsOutput, ['words']);

const functionOutput = [];
run(`
  func add(int a int b)
  {
    return a + b
  }
  func greet(string name)
  {
    print("Hello, " + name)
  }
  greet("Fable")
  print(add(2 3))
`, (value) => functionOutput.push(value));
assert.deepEqual(functionOutput, ['Hello, Fable', '5']);

const recursiveOutput = [];
run(`
  func factorial(int number) -> int
  {
    if number <= 1 {
      return 1
    }
    return number * factorial(number - 1)
  }
  print(factorial(5))
`, (value) => recursiveOutput.push(value));
assert.deepEqual(recursiveOutput, ['120']);

const argumentErrors = validate('func show(int value) {\nprint(value)\n}\nshow("wrong")');
assert.equal(argumentErrors.length, 1);
assert.match(argumentErrors[0].message, /должен иметь тип int/);

const loopOutput = [];
run(`
  var count = 0
  while count < 3 {
    print(count)
    count = count + 1
  }
  repeat 2 times {
    print("repeat")
  }
`, (value) => loopOutput.push(value));
assert.deepEqual(loopOutput, ['0', '1', '2', 'repeat', 'repeat']);

const repeatTypeErrors = validate('repeat 2.5 times {\nprint("wrong")\n}');
assert.equal(repeatTypeErrors.length, 1);
assert.match(repeatTypeErrors[0].message, /тип int/);

assert.throws(
  () => run('repeat -1 times {\nprint("never")\n}'),
  /не может быть отрицательным/,
);

const collectionOutput = [];
run(`
  var numbers = [1, 2, 3]
  numbers.add(4)
  numbers.remove(2)
  print(numbers.len)
  print(numbers[0])
  for number in numbers {
    print(number)
  }
  var user = {name: "Alex", age: 18}
  print(user.name)
  print(user.age)
  print(user.len)
  for key in user {
    print(key)
  }
`, (value) => collectionOutput.push(value));
assert.deepEqual(collectionOutput, ['3', '1', '1', '3', '4', 'Alex', '18', '2', 'name', 'age']);

const emptyListOutput = [];
run('list<int> numbers = []\nnumbers.add(5)\nprint(numbers[0])',
  (value) => emptyListOutput.push(value));
assert.deepEqual(emptyListOutput, ['5']);

const mixedListOutput = [];
run(`
  var values = [1, "two", true, {name: "Alex"}]
  values.add(3.5)
  for value in values {
    print(value)
  }
`, (value) => mixedListOutput.push(value));
assert.deepEqual(mixedListOutput.slice(0, 3), ['1', 'two', 'true']);
assert.equal(mixedListOutput[4], '3.5');

const strictListErrors = validate('list<int> values = [1, "two"]');
assert.equal(strictListErrors.length, 1);
assert.match(strictListErrors[0].message, /list<any>.*list<int>/);

const missingKeyErrors = validate('var user = {name: "Alex"}\nprint(user.age)');
assert.equal(missingKeyErrors.length, 1);
assert.match(missingKeyErrors[0].message, /нет ключа/);

const inferredEmptyOutput = [];
run('var values = []\nvalues.add(1)\nprint(values.len)',
  (value) => inferredEmptyOutput.push(value));
assert.deepEqual(inferredEmptyOutput, ['1']);

const inferredEmptyErrors = validate('var values = []\nvalues.add(1)\nvalues.add("wrong")');
assert.equal(inferredEmptyErrors.length, 1);
assert.match(inferredEmptyErrors[0].message, /ожидает int/);

assert.throws(
  () => run('var values = [1]\nprint(values[2])'),
  /вне списка/,
);

const classOutput = [];
run(`
  class Person
  {
    var name
    var age
    __init(name, age)
    {
      self.name = name
      self.age = age
    }
    func greet()
    {
      print("Hello, " + self.name)
    }
    func getAge()
    {
      return self.age
    }
  }
  var person = Person("Alex", 18)
  person.greet()
  print(person.name)
  print(person.getAge())
`, (value) => classOutput.push(value));
assert.deepEqual(classOutput, ['Hello, Alex', 'Alex', '18']);

const constructorErrors = validate('class Empty {\n}\nEmpty(1)');
assert.equal(constructorErrors.length, 1);
assert.match(constructorErrors[0].message, /ожидает 0 аргументов/);

const fieldErrors = validate('class Empty {\n}\nvar value = Empty()\nprint(value.missing)');
assert.equal(fieldErrors.length, 1);
assert.match(fieldErrors[0].message, /нет поля/);

const typedClassOutput = [];
run(`
  class Counter {
    int value
    __init(int value) {
      self.value = value
    }
  }
  var counter = Counter(7)
  print(counter.value)
`, (value) => typedClassOutput.push(value));
assert.deepEqual(typedClassOutput, ['7']);

const moduleFiles = new Map([
  ['C:\\project\\math.fable', `
    var PI = 3.14
    func double(int value) {
      return value * 2
    }
    func addAndDouble(int a int b) {
      return double(a + b)
    }
  `],
]);
let moduleLoads = 0;
const moduleOutput = [];
run(`
  import math
  print(math.PI)
  print(math.addAndDouble(2, 3))
`, (value) => moduleOutput.push(value), {
  filePath: 'C:\\project\\main.fable',
  loadModule(name) {
    moduleLoads += 1;
    const filePath = `C:\\project\\${name}.fable`;
    return { source: moduleFiles.get(filePath), filePath };
  },
});
assert.deepEqual(moduleOutput, ['3.14', '10']);
assert.equal(moduleLoads, 1);

assert.throws(
  () => run('import missing', () => {}, {
    filePath: 'C:\\project\\main.fable',
    loadModule() { throw new Error('файл не найден'); },
  }),
  /Не удалось загрузить модуль «missing»/,
);

const cyclicFiles = new Map([
  ['C:\\project\\a.fable', 'import b'],
  ['C:\\project\\b.fable', 'import a'],
]);
assert.throws(
  () => run('import a', () => {}, {
    filePath: 'C:\\project\\main.fable',
    loadModule(name) {
      const filePath = `C:\\project\\${name}.fable`;
      return { source: cyclicFiles.get(filePath), filePath };
    },
  }),
  /Циклический import/,
);

console.log('runtime tests passed');
