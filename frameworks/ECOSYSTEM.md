# Экосистема FableScript

Здесь перечислены существующие публичные пакеты и фреймворки FableScript. Реестр пока молодой, поэтому список закономерно не поражает воображение.

## Фреймворки

Полноценных фреймворков пока нет.

## Встроенные модули

| Модуль | Назначение | Установка |
| --- | --- | --- |
| `file` | Чтение и запись текстовых файлов | Входит в язык |
| `json` | Разбор и создание JSON | Входит в язык |
| `math` | Математические функции и константы | Входит в язык |
| `random` | Случайные числа, выбор элементов и вероятности | Входит в язык |
| `window` | Графическое окно, фигуры, изображения, звук и ввод | `fable install window` |

### file

```fable
import file

file.write("save.txt", "score=10")
print(file.read("save.txt"))
```

Защищённая запись RANS#M1 использует AES-256-GCM и пароль:

```fable
file.write("save.json", "secret", "rans#m", "strong-password")
print(file.read("save.json", "rans#m", "strong-password"))
```

Экспортируемые функции: `read`, `write`, `append`, `exists`.

### json

```fable
import json

string text = json.stringify({name: "Alex", score: 10})
var data = json.parse(text)
print(data.name)
```

Экспортируемые функции: `parse`, `stringify`, `pretty`.

### math

```fable
import math

print(math.sqrt(81))
print(math.PI)
```

Экспортируемые значения: `PI`, `E`. Функции: `abs`, `min`, `max`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `sin`, `cos`, `tan`.

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

Версия 1.1 добавляет `sprite`, `playSound`, `playMusic`, события `keyPressed`/`keyReleased` и `mousePressed`/`mouseReleased`, а также `collides`, `circlesCollide` и `pointInside`. В версии 1.1.1 появилась `close`, которая корректно закрывает нативное окно из программы. Версия 1.2 добавляет настоящее отдельное окно на Mac с Apple Silicon (`darwin-arm64`, macOS 11+).

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
