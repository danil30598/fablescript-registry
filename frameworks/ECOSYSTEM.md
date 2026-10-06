# Экосистема FableScript

Здесь перечислены существующие публичные пакеты и фреймворки FableScript. Реестр пока молодой, поэтому список закономерно не поражает воображение.

## Фреймворки

Полноценных фреймворков пока нет.

## Встроенные модули

| Модуль | Назначение | Установка |
| --- | --- | --- |
| `file` | Чтение и запись текстовых файлов | Входит в язык |
| `random` | Случайные числа, выбор элементов и вероятности | Входит в язык |
| `window` | Графическое окно, фигуры, изображения, звук и ввод | `fable install window` |

### file

```fable
import file

file.write("save.txt", "score=10")
print(file.read("save.txt"))
```

Экспортируемые функции: `read`, `write`, `append`, `exists`.

### random

```fable
import random

print(random.int(1, 6))
```

Экспортируемые функции: `seed`, `int`, `float`, `choice`, `chance`.

### window

Установка:

```powershell
fable install window
```

```fable
import window

window.create(800, 520, "Моё окно")
window.background("#18212f")
window.circle(400, 220, 80, "#ffca3a")
window.text("Hello!", 60, 350, 38, "white")
window.show()
```

Версия 1.1 добавляет `sprite`, `playSound`, `playMusic`, события `keyPressed`/`keyReleased` и `mousePressed`/`mouseReleased`, а также `collides`, `circlesCollide` и `pointInside`. В версии 1.1.1 появилась `close`, которая корректно закрывает нативное окно из программы.

Экспортируемые функции: `create`, `title`, `background`, `rect`, `circle`, `line`, `text`, `image`, `sprite`, `show`, `close`, `update`, `deltaTime`, `isOpen`, `keyDown`, `keyPressed`, `keyReleased`, `mouseX`, `mouseY`, `mouseDown`, `mousePressed`, `mouseReleased`, `collides`, `circlesCollide`, `pointInside`, `playSound`, `stopSounds`, `playMusic`, `stopMusic`.

## Пакеты

| Пакет | Версия | Назначение | Установка |
| --- | --- | --- | --- |
| `greetings` | `1.0.0` | Пример пакета с функцией приветствия | `fable install greetings` |

### greetings

```fable
import greetings

print(greetings.hello("Alex"))
```

Экспортируемые функции:

- `hello(string name)` — возвращает строку `"Привет, " + name`.
