'use strict';

const JSON_MEMBERS = [
  { kind: 'function', name: 'parse', parameters: ['text'], detail: 'Прочитать JSON-строку' },
  { kind: 'function', name: 'stringify', parameters: ['value'], detail: 'Преобразовать значение в JSON-строку' },
  { kind: 'function', name: 'pretty', parameters: ['value'], detail: 'Преобразовать значение в форматированный JSON' },
];

function createJsonModule() {
  return {
    parse(text) {
      if (typeof text !== 'string') throw new Error('json.parse ожидает строку.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Некорректный JSON: ${error.message}`);
      }
    },
    stringify(value) {
      const text = JSON.stringify(value);
      if (text === undefined) throw new Error('Это значение нельзя преобразовать в JSON.');
      return text;
    },
    pretty(value) {
      const text = JSON.stringify(value, null, 2);
      if (text === undefined) throw new Error('Это значение нельзя преобразовать в JSON.');
      return text;
    },
  };
}

module.exports = { JSON_MEMBERS, createJsonModule };
