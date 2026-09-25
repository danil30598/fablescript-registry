'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createWindowModule, findPythonw } = require('../runtime/native-modules/window');

const nativeModulesDirectory = path.join('C:', 'FableScript', 'runtime', 'native-modules');
const bundledPython = path.join('C:', 'Project', 'fable_modules', '.native', 'window', 'python-win-x64', 'pythonw.exe');
assert.equal(findPythonw({
  nativeModulesDirectory,
  pythonExecutable: bundledPython,
  environment: { FABLE_PYTHONW: path.join('C:', 'Other', 'pythonw.exe') },
  exists(candidate) { return candidate === bundledPython; },
}), bundledPython);

let writtenPath = null;
let writtenScene = null;
let openedPath = null;
const inputState = {
  open: true,
  keys: ['left'],
  keyPresses: { space: 2 },
  keyReleases: { enter: 1 },
  mouseX: 25,
  mouseY: 40,
  mouseButtons: ['left'],
  mousePresses: { left: 3 },
  mouseReleases: { right: 1 },
};
const graphics = createWindowModule({
  temporaryDirectory: 'C:\\Temp',
  baseDirectory: 'C:\\Project',
  platform: 'win32',
  writeFile(filePath, contents) { writtenPath = filePath; writtenScene = contents; },
  readFile() { return JSON.stringify(inputState); },
  fileExists(filePath) { return filePath.endsWith('.state.json') || /player\.png|jump\.wav|music\.ogg/.test(filePath); },
  sleep() {},
  openNative(filePath) { openedPath = filePath; return {}; },
});

graphics.create(640, 480, 'Test <window>');
graphics.title('Game title');
graphics.background('#123456');
graphics.rect(10, 20, 100, 50, 'red');
graphics.circle(200, 150, 25, 'yellow');
graphics.line(0, 0, 50, 50, 'white', 3);
graphics.text('FableScript', 30, 300, 24, 'white');
graphics.image('player.png', 300, 200, 64, 64);
graphics.sprite('player.png', 400, 200, 64, 64, 45);
graphics.playSound('jump.wav', 0.5);
graphics.playMusic('music.ogg', true, 0.25);
assert.equal(graphics.show(), true);

assert.equal(openedPath, writtenPath);
assert.match(writtenPath, /fablescript-window-[a-f0-9-]+\.json$/);
const scene = JSON.parse(writtenScene);
assert.equal(scene.width, 640);
assert.equal(scene.height, 480);
assert.equal(scene.title, 'Game title');
assert.equal(scene.background, '#123456');
assert.equal(scene.items[1].kind, 'circle');
assert.equal(scene.items[3].value, 'FableScript');
assert.equal(scene.items[4].kind, 'image');
assert.equal(scene.items[4].path, 'C:\\Project\\player.png');
assert.equal(scene.items[5].kind, 'sprite');
assert.equal(scene.items[5].angle, 45);
assert.equal(scene.commands[0].kind, 'playSound');
assert.equal(scene.commands[1].kind, 'playMusic');
assert.equal(graphics.isOpen(), true);
assert.equal(graphics.keyDown('LEFT'), true);
assert.equal(graphics.keyPressed('SPACE'), true);
assert.equal(graphics.keyPressed('SPACE'), false);
assert.equal(graphics.keyReleased('enter'), true);
assert.equal(graphics.mouseX(), 25);
assert.equal(graphics.mouseY(), 40);
assert.equal(graphics.mouseDown('left'), true);
assert.equal(graphics.mousePressed('left'), true);
assert.equal(graphics.mousePressed('left'), false);
assert.equal(graphics.mouseReleased('right'), true);
assert.equal(graphics.collides(0, 0, 20, 20, 10, 10, 20, 20), true);
assert.equal(graphics.collides(0, 0, 10, 10, 10, 0, 10, 10), false);
assert.equal(graphics.circlesCollide(0, 0, 10, 15, 0, 10), true);
assert.equal(graphics.pointInside(5, 5, 0, 0, 10, 10), true);
assert.equal(graphics.update(60), true);
assert.throws(() => graphics.image('missing.png', 0, 0, 10, 10), /Не найден файл/);
assert.throws(() => graphics.circle(0, 0, -1, 'red'), /положительным числом/);

let fallbackHtml = '';
const fallback = createWindowModule({
  temporaryDirectory: '/tmp',
  platform: 'linux',
  writeFile(filePath, contents) { fallbackHtml = contents; },
  openExternal() {},
});
fallback.create(320, 200, 'Fallback');
fallback.show();
assert.match(fallbackHtml, /<canvas id="screen" width="320" height="200">/);

console.log('window module tests passed');
