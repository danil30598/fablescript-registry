'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProject, projectEntry } = require('../runtime/cli');

test('creates a runnable project without overwriting an existing folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-new-'));
  try {
    const project = createProject('MyGame', root);
    assert.equal(projectEntry(project), path.join(project, 'main.fable'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'fable.json'), 'utf8')).entry, 'main.fable');
    assert.ok(fs.statSync(path.join(project, 'fable_modules')).isDirectory());
    assert.throws(() => createProject('MyGame', root), /уже существует/);
    assert.throws(() => createProject('../bad', root), /Имя проекта/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('uses main.fable when a project config is absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fablescript-entry-'));
  try {
    fs.writeFileSync(path.join(root, 'main.fable'), 'print("ok")');
    assert.equal(projectEntry(root), path.join(root, 'main.fable'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
