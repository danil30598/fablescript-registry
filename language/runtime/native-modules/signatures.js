'use strict';

const BUILTIN_RETURN_TYPES = {
  random: {
    seed: 'any',
    int: 'int',
    float: 'float',
    choice: 'any',
    chance: 'bool',
  },
  window: {
    create: 'any',
    title: 'any',
    background: 'any',
    rect: 'any',
    circle: 'any',
    line: 'any',
    text: 'any',
    image: 'any',
    sprite: 'any',
    show: 'any',
    close: 'bool',
    update: 'any',
    deltaTime: 'float',
    isOpen: 'bool',
    keyDown: 'bool',
    keyPressed: 'bool',
    keyReleased: 'bool',
    mouseX: 'int',
    mouseY: 'int',
    mouseDown: 'bool',
    mousePressed: 'bool',
    mouseReleased: 'bool',
    collides: 'bool',
    circlesCollide: 'bool',
    pointInside: 'bool',
    playSound: 'bool',
    stopSounds: 'bool',
    playMusic: 'bool',
    stopMusic: 'bool',
  },
};

function builtinReturnType(moduleName, memberName) {
  return BUILTIN_RETURN_TYPES[moduleName]?.[memberName] || 'any';
}

module.exports = { BUILTIN_RETURN_TYPES, builtinReturnType };
