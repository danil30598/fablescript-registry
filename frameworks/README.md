# Реестр пакетов FableScript

`index.json` — публичный реестр первой версии. GitHub раздаёт его и файлы `.fable` как статические файлы через `raw.githubusercontent.com`.

Каждая версия пакета содержит URL исходного файла и обязательную контрольную сумму SHA-256. Установщик проверяет сумму до записи файла в проект.

После публикации адрес реестра указывается в проекте:

```json
{
  "name": "my_project",
  "registry": "https://raw.githubusercontent.com/danil30598/fablescript-registry/main/frameworks/index.json"
}
```

Установка выполняется командой:

```powershell
node .\runtime\cli.js install greetings
```
