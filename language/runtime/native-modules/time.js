'use strict';

const TIME_MEMBERS = [
  { kind: 'function', name: 'sleep', parameters: ['seconds'], detail: 'Приостановить программу на указанное число секунд' },
  { kind: 'function', name: 'now', parameters: [], detail: 'Текущее Unix-время в секундах' },
  { kind: 'function', name: 'delta', parameters: [], detail: 'Секунды с предыдущего вызова time.delta()' },
];

function finiteNonNegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} должно быть неотрицательным числом.`);
  return value;
}

function defaultSleep(milliseconds) {
  if (milliseconds === 0) return;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function createTimeModule(options = {}) {
  const nowMilliseconds = options.now || Date.now;
  const sleepMilliseconds = options.sleep || defaultSleep;
  let previousDelta = nowMilliseconds();

  return {
    sleep(seconds) {
      const duration = finiteNonNegative(seconds, 'Время ожидания');
      sleepMilliseconds(duration * 1000);
    },
    now() {
      return nowMilliseconds() / 1000;
    },
    delta() {
      const current = nowMilliseconds();
      const elapsed = Math.max(0, current - previousDelta) / 1000;
      previousDelta = current;
      return elapsed;
    },
  };
}

module.exports = { TIME_MEMBERS, createTimeModule };
