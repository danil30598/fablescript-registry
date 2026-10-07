'use strict';

const BUILTIN_RETURN_TYPES = {
  file: {
    read: 'string',
    write: 'bool',
    append: 'bool',
    exists: 'bool',
  },
  random: {
    seed: 'any',
    int: 'int',
    float: 'float',
    choice: 'any',
    chance: 'bool',
  },
  math: {
    abs: 'float', min: 'float', max: 'float', round: 'int', floor: 'int', ceil: 'int',
    sqrt: 'float', pow: 'float', sin: 'float', cos: 'float', tan: 'float',
  },
  json: {
    parse: 'any', stringify: 'string', pretty: 'string',
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

const BUILTIN_MEMBER_TYPES = {
  math: { PI: 'float', E: 'float' },
};

function builtinReturnType(moduleName, memberName) {
  return BUILTIN_RETURN_TYPES[moduleName]?.[memberName] || 'any';
}

function builtinMemberType(moduleName, memberName) {
  return BUILTIN_MEMBER_TYPES[moduleName]?.[memberName] || 'any';
}

module.exports = { BUILTIN_MEMBER_TYPES, BUILTIN_RETURN_TYPES, builtinMemberType, builtinReturnType };
