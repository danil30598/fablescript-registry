'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const WINDOW_MEMBERS = [
  { kind: 'function', name: 'create', parameters: ['width', 'height', 'title'], detail: 'Создать холст окна' },
  { kind: 'function', name: 'title', parameters: ['value'], detail: 'Изменить название окна' },
  { kind: 'function', name: 'background', parameters: ['color'], detail: 'Очистить кадр и задать цвет фона' },
  { kind: 'function', name: 'rect', parameters: ['x', 'y', 'width', 'height', 'color'], detail: 'Нарисовать прямоугольник' },
  { kind: 'function', name: 'circle', parameters: ['x', 'y', 'radius', 'color'], detail: 'Нарисовать круг' },
  { kind: 'function', name: 'line', parameters: ['x1', 'y1', 'x2', 'y2', 'color', 'width'], detail: 'Нарисовать линию' },
  { kind: 'function', name: 'text', parameters: ['value', 'x', 'y', 'size', 'color'], detail: 'Нарисовать текст' },
  { kind: 'function', name: 'image', parameters: ['file', 'x', 'y', 'width', 'height'], detail: 'Нарисовать изображение из файла' },
  { kind: 'function', name: 'show', parameters: [], detail: 'Открыть окно' },
  { kind: 'function', name: 'update', parameters: ['fps'], detail: 'Показать новый кадр и ограничить FPS' },
  { kind: 'function', name: 'isOpen', parameters: [], detail: 'Проверить, открыто ли окно' },
  { kind: 'function', name: 'keyDown', parameters: ['key'], detail: 'Проверить, нажата ли клавиша' },
  { kind: 'function', name: 'mouseX', parameters: [], detail: 'Координата мыши по X' },
  { kind: 'function', name: 'mouseY', parameters: [], detail: 'Координата мыши по Y' },
  { kind: 'function', name: 'mouseDown', parameters: ['button'], detail: 'Проверить кнопку мыши' },
];

function finiteNumber(value, name, { positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) {
    throw new Error(`${name} должен быть ${positive ? 'положительным ' : ''}числом.`);
  }
  return value;
}

function colorValue(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Цвет должен быть непустой строкой.');
  return value;
}

function defaultOpenExternal(filePath) {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [filePath], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

function findPythonw(options = {}) {
  const nativeModulesDirectory = options.nativeModulesDirectory || __dirname;
  const environment = options.environment || process.env;
  const exists = options.exists || fs.existsSync;
  const readDirectory = options.readDirectory || ((directory) => fs.readdirSync(directory, { withFileTypes: true }));
  const pythonRoot = path.join(environment.LOCALAPPDATA || '', 'Programs', 'Python');
  const candidates = [];
  if (options.pythonExecutable) candidates.push(options.pythonExecutable);
  if (environment.FABLE_PYTHONW) candidates.push(environment.FABLE_PYTHONW);
  if (environment.LOCALAPPDATA && exists(pythonRoot)) {
    for (const entry of readDirectory(pythonRoot)) {
      if (entry.isDirectory() && entry.name.startsWith('Python')) candidates.push(path.join(pythonRoot, entry.name, 'pythonw.exe'));
    }
  }
  return candidates.find((candidate) => exists(candidate)) || null;
}

function defaultOpenNative(scenePath, options = {}) {
  const hostPath = options.hostPath || path.join(__dirname, 'window-host.py');
  if (!fs.existsSync(hostPath)) throw new Error('Не найден графический хост window-host.py. Переустановите FableScript.');
  const python = findPythonw({ pythonExecutable: options.pythonExecutable });
  if (!python) throw new Error('Графический движок не найден. Выполните: fable install window');
  return spawn(python, [hostPath, scenePath], { stdio: 'ignore' });
}

function htmlFor(scene) {
  const data = JSON.stringify(scene).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${scene.title.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])}</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #111; display: grid; place-items: center; }
    canvas { box-shadow: 0 12px 50px #000a; max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <canvas id="screen" width="${scene.width}" height="${scene.height}"></canvas>
  <script>
    const scene = ${data};
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const item of scene.items) {
      ctx.fillStyle = item.color;
      ctx.strokeStyle = item.color;
      if (item.kind === 'rect') ctx.fillRect(item.x, item.y, item.width, item.height);
      if (item.kind === 'circle') {
        ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2); ctx.fill();
      }
      if (item.kind === 'line') {
        ctx.lineWidth = item.width; ctx.beginPath(); ctx.moveTo(item.x1, item.y1); ctx.lineTo(item.x2, item.y2); ctx.stroke();
      }
      if (item.kind === 'text') {
        ctx.font = item.size + 'px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(item.value, item.x, item.y);
      }
      if (item.kind === 'image') {
        const image = new Image(); image.src = item.uri; image.onload = () => ctx.drawImage(image, item.x, item.y, item.width, item.height);
      }
    }
  </script>
</body>
</html>`;
}

function createWindowModule(options = {}) {
  const writeFile = options.writeFile || ((filePath, contents) => fs.writeFileSync(filePath, contents, 'utf8'));
  const openExternal = options.openExternal || defaultOpenExternal;
  const openNative = options.openNative || ((scenePath) => defaultOpenNative(scenePath, options));
  const platform = options.platform || process.platform;
  const temporaryDirectory = options.temporaryDirectory || os.tmpdir();
  const baseDirectory = options.baseDirectory || process.cwd();
  const readFile = options.readFile || ((filePath) => fs.readFileSync(filePath, 'utf8'));
  const fileExists = options.fileExists || fs.existsSync;
  const sleep = options.sleep || ((milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds));
  const scene = { width: 800, height: 600, title: 'FableScript', background: '#20242b', items: [] };
  let scenePath = null;
  let statePath = null;
  let nativeChild = null;
  let lastFrameAt = 0;

  const writeScene = () => {
    if (!scenePath) return;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        writeFile(scenePath, `${JSON.stringify(scene)}\n`);
        return;
      } catch (error) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 9) throw error;
        sleep(1);
      }
    }
  };
  const readState = () => {
    if (!statePath || !fileExists(statePath)) return { open: Boolean(nativeChild) };
    try { return JSON.parse(readFile(statePath)); }
    catch { return { open: Boolean(nativeChild) }; }
  };

  return {
    create(width, height, title) {
      scene.width = finiteNumber(width, 'Ширина', { positive: true });
      scene.height = finiteNumber(height, 'Высота', { positive: true });
      if (typeof title !== 'string') throw new Error('Заголовок должен быть строкой.');
      scene.title = title;
      scene.items = [];
    },
    title(value) {
      if (typeof value !== 'string') throw new Error('Название окна должно быть строкой.');
      scene.title = value;
    },
    background(color) {
      scene.background = colorValue(color);
      scene.items = [];
    },
    rect(x, y, width, height, color) {
      scene.items.push({ kind: 'rect', x: finiteNumber(x, 'x'), y: finiteNumber(y, 'y'), width: finiteNumber(width, 'Ширина', { positive: true }), height: finiteNumber(height, 'Высота', { positive: true }), color: colorValue(color) });
    },
    circle(x, y, radius, color) {
      scene.items.push({ kind: 'circle', x: finiteNumber(x, 'x'), y: finiteNumber(y, 'y'), radius: finiteNumber(radius, 'Радиус', { positive: true }), color: colorValue(color) });
    },
    line(x1, y1, x2, y2, color, width) {
      scene.items.push({ kind: 'line', x1: finiteNumber(x1, 'x1'), y1: finiteNumber(y1, 'y1'), x2: finiteNumber(x2, 'x2'), y2: finiteNumber(y2, 'y2'), color: colorValue(color), width: finiteNumber(width, 'Толщина', { positive: true }) });
    },
    text(value, x, y, size, color) {
      scene.items.push({ kind: 'text', value: String(value), x: finiteNumber(x, 'x'), y: finiteNumber(y, 'y'), size: finiteNumber(size, 'Размер текста', { positive: true }), color: colorValue(color) });
    },
    image(file, x, y, width, height) {
      if (typeof file !== 'string' || !file.trim()) throw new Error('Путь к изображению должен быть строкой.');
      const imagePath = path.isAbsolute(file) ? path.normalize(file) : path.resolve(baseDirectory, file);
      if (!fileExists(imagePath)) throw new Error(`Изображение не найдено: ${imagePath}`);
      scene.items.push({ kind: 'image', path: imagePath, uri: pathToFileURL(imagePath).href, x: finiteNumber(x, 'x'), y: finiteNumber(y, 'y'), width: finiteNumber(width, 'Ширина', { positive: true }), height: finiteNumber(height, 'Высота', { positive: true }) });
    },
    show() {
      if (platform === 'win32') {
        if (scenePath && readState().open) return true;
        scenePath = path.join(temporaryDirectory, `fablescript-window-${randomUUID()}.json`);
        statePath = `${scenePath}.state.json`;
        writeScene();
        nativeChild = openNative(scenePath);
        lastFrameAt = Date.now();
        return true;
      }
      const filePath = path.join(temporaryDirectory, `fablescript-window-${randomUUID()}.html`);
      writeFile(filePath, htmlFor(scene));
      openExternal(filePath);
      return true;
    },
    update(fps) {
      if (!scenePath) throw new Error('Сначала вызовите window.show().');
      const frameRate = finiteNumber(fps, 'FPS', { positive: true });
      writeScene();
      const frameTime = 1000 / frameRate;
      const remaining = frameTime - (Date.now() - lastFrameAt);
      if (remaining > 0) sleep(remaining);
      lastFrameAt = Date.now();
      return true;
    },
    isOpen() { return Boolean(readState().open); },
    keyDown(key) {
      if (typeof key !== 'string') throw new Error('Имя клавиши должно быть строкой.');
      return (readState().keys || []).includes(key.toLowerCase());
    },
    mouseX() { return Number(readState().mouseX || 0); },
    mouseY() { return Number(readState().mouseY || 0); },
    mouseDown(button) {
      if (typeof button !== 'string') throw new Error('Имя кнопки мыши должно быть строкой.');
      return (readState().mouseButtons || []).includes(button.toLowerCase());
    },
  };
}

module.exports = { WINDOW_MEMBERS, createWindowModule, findPythonw, htmlFor };
