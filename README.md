# FableScript

Экспериментальный язык программирования с простым синтаксисом, классами, коллекциями, локальными и глобальными модулями, менеджером пакетов и расширением для VS Code.

## Структура

- [`language/`](./language/) — интерпретатор, CLI, расширение VS Code, примеры и тесты языка.
- [`frameworks/`](./frameworks/) — публичный реестр, пакеты и список экосистемы FableScript.

## Расширение VS Code

Готовый файл: [`language/build/fablescript-0.0.43.vsix`](./language/build/fablescript-0.0.43.vsix).

Расширение добавляет подсветку, диагностику, интерактивный ввод через `input()`, `try/catch`, запуск по `F6`, переносимую сборку, автодополнение и подсказки параметров функций. Язык поддерживает `%`, составные присваивания, `else if`, `range()`, `null`, защищённые файлы RANS#M1 и запуск других файлов через `execute()`; встроены преобразования типов и модули `random`, `file`, `math`, `json`. Отдельный пакет `window` поддерживает фигуры, изображения, звук, столкновения, клавиатуру, мышь и игровой цикл в нативном окне Windows x64 и macOS на Apple Silicon. Готовый пример игры находится в [`language/examples/dodge-game.fable`](./language/examples/dodge-game.fable).

## CLI на Mac с Apple Silicon

Из папки `language` выполните один раз:

```bash
sh ./tools/install-cli.sh
```

После открытия нового Terminal доступны команды:

```bash
fable install window
fable run examples/hello.fable
```

`window` 1.2.0 скачивает собственные Python и Pygame для `darwin-arm64`; устанавливать их отдельно не нужно.

## Пакеты

```powershell
fable install greetings
fable install window
```

```fable
import greetings

print(greetings.hello("Alex"))
```

Полный список находится в [`frameworks/ECOSYSTEM.md`](./frameworks/ECOSYSTEM.md).
