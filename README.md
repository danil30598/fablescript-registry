# FableScript

Экспериментальный язык программирования с простым синтаксисом, классами, коллекциями, локальными и глобальными модулями, менеджером пакетов и расширением для VS Code.

## Структура

- [`language/`](./language/) — интерпретатор, CLI, расширение VS Code, примеры и тесты языка.
- [`frameworks/`](./frameworks/) — публичный реестр, пакеты и список экосистемы FableScript.

## Расширение VS Code

Готовый файл: [`language/build/fablescript-0.0.18.vsix`](./language/build/fablescript-0.0.18.vsix).

Расширение добавляет подсветку, диагностику, запуск по `F6` и автодополнение языка, модулей и экспортируемых функций.

## Пакеты

```powershell
fable install greetings
```

```fable
import greetings

print(greetings.hello("Alex"))
```

Полный список находится в [`frameworks/ECOSYSTEM.md`](./frameworks/ECOSYSTEM.md).
