# Экосистема FableScript

Здесь перечислены существующие публичные пакеты и фреймворки FableScript. Реестр пока молодой, поэтому список закономерно не поражает воображение.

## Фреймворки

Полноценных фреймворков пока нет.

## Встроенные модули

| Модуль | Назначение | Установка |
| --- | --- | --- |
| `window` | Графическое окно, фигуры, линии, изображения и ввод | `fable install window` |

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

Экспортируемые функции: `create`, `title`, `background`, `rect`, `circle`, `line`, `text`, `image`, `show`, `update`, `isOpen`, `keyDown`, `mouseX`, `mouseY`, `mouseDown`.

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
