'use strict';

const fs = require('node:fs');

function readConsoleInput(prompt = '') {
  if (prompt) process.stdout.write(String(prompt));
  const bytes = [];
  const buffer = Buffer.alloc(1);
  while (true) {
    const count = fs.readSync(0, buffer, 0, 1, null);
    if (count === 0 || buffer[0] === 10) break;
    if (buffer[0] !== 13) bytes.push(buffer[0]);
  }
  return Buffer.from(bytes).toString('utf8');
}

module.exports = { readConsoleInput };
