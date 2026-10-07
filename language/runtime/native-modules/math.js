'use strict';

const MATH_MEMBERS = [
  { kind: 'variable', name: 'PI', detail: 'Число π' },
  { kind: 'variable', name: 'E', detail: 'Число Эйлера' },
  { kind: 'function', name: 'abs', parameters: ['value'], detail: 'Модуль числа' },
  { kind: 'function', name: 'min', parameters: ['a', 'b'], detail: 'Меньшее из двух чисел' },
  { kind: 'function', name: 'max', parameters: ['a', 'b'], detail: 'Большее из двух чисел' },
  { kind: 'function', name: 'round', parameters: ['value'], detail: 'Округлить до ближайшего целого' },
  { kind: 'function', name: 'floor', parameters: ['value'], detail: 'Округлить вниз' },
  { kind: 'function', name: 'ceil', parameters: ['value'], detail: 'Округлить вверх' },
  { kind: 'function', name: 'sqrt', parameters: ['value'], detail: 'Квадратный корень' },
  { kind: 'function', name: 'pow', parameters: ['value', 'power'], detail: 'Возвести число в степень' },
  { kind: 'function', name: 'sin', parameters: ['value'], detail: 'Синус угла в радианах' },
  { kind: 'function', name: 'cos', parameters: ['value'], detail: 'Косинус угла в радианах' },
  { kind: 'function', name: 'tan', parameters: ['value'], detail: 'Тангенс угла в радианах' },
];

function finite(value, name = 'Значение') {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} должно быть числом.`);
  return value;
}

function result(value) {
  if (!Number.isFinite(value)) throw new Error('Результат математической операции не является конечным числом.');
  return value;
}

function createMathModule() {
  return {
    PI: Math.PI,
    E: Math.E,
    abs: (value) => Math.abs(finite(value)),
    min: (a, b) => Math.min(finite(a, 'Первое значение'), finite(b, 'Второе значение')),
    max: (a, b) => Math.max(finite(a, 'Первое значение'), finite(b, 'Второе значение')),
    round: (value) => Math.round(finite(value)),
    floor: (value) => Math.floor(finite(value)),
    ceil: (value) => Math.ceil(finite(value)),
    sqrt(value) {
      const number = finite(value);
      if (number < 0) throw new Error('Квадратный корень отрицательного числа не поддерживается.');
      return Math.sqrt(number);
    },
    pow: (value, power) => result(Math.pow(finite(value, 'Основание'), finite(power, 'Степень'))),
    sin: (value) => result(Math.sin(finite(value))),
    cos: (value) => result(Math.cos(finite(value))),
    tan: (value) => result(Math.tan(finite(value))),
  };
}

module.exports = { MATH_MEMBERS, createMathModule };
