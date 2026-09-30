'use strict';

const RANDOM_MEMBERS = [
  { kind: 'function', name: 'seed', parameters: ['value'], detail: 'Задать начальное значение генератора' },
  { kind: 'function', name: 'int', parameters: ['min', 'max'], detail: 'Случайное целое число, включая обе границы' },
  { kind: 'function', name: 'float', parameters: ['min', 'max'], detail: 'Случайное дробное число' },
  { kind: 'function', name: 'choice', parameters: ['values'], detail: 'Выбрать случайный элемент списка' },
  { kind: 'function', name: 'chance', parameters: ['probability'], detail: 'Вернуть true с заданной вероятностью от 0 до 1' },
];

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} должен быть числом.`);
  return value;
}

function createRandomModule(options = {}) {
  const systemRandom = options.random || Math.random;
  let state = null;

  const next = () => {
    if (state === null) return systemRandom();
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };

  return {
    seed(value) {
      const seed = Math.trunc(finite(value, 'Seed')) >>> 0;
      state = seed || 0x9e3779b9;
      return value;
    },
    int(min, max) {
      const lower = finite(min, 'Минимум');
      const upper = finite(max, 'Максимум');
      if (!Number.isInteger(lower) || !Number.isInteger(upper)) throw new Error('Границы random.int должны быть целыми числами.');
      if (lower > upper) throw new Error('Минимум не может быть больше максимума.');
      return lower + Math.floor(next() * (upper - lower + 1));
    },
    float(min, max) {
      const lower = finite(min, 'Минимум');
      const upper = finite(max, 'Максимум');
      if (lower > upper) throw new Error('Минимум не может быть больше максимума.');
      return lower + next() * (upper - lower);
    },
    choice(values) {
      if (!Array.isArray(values) || values.length === 0) throw new Error('random.choice ожидает непустой список.');
      return values[Math.floor(next() * values.length)];
    },
    chance(probability) {
      const value = finite(probability, 'Вероятность');
      if (value < 0 || value > 1) throw new Error('Вероятность должна быть числом от 0 до 1.');
      return next() < value;
    },
  };
}

module.exports = { RANDOM_MEMBERS, createRandomModule };
