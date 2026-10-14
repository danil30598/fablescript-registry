# Справочник языка FableScript

Этот файл описывает основное ядро FableScript. API отдельных модулей здесь намеренно нет: встроенные и устанавливаемые пакеты описываются в README и каталоге `frameworks`.

## Файлы и комментарии

Исходные файлы имеют расширение `.fable`. Точка с запятой в конце строки необязательна. Однострочный комментарий начинается с `//`.

```fable
// Первая программа
print("Привет, FableScript!")
```

## Значения и переменные

Основные типы: `int`, `float`, `string`, `bool`, `list<T>`, таблица и `any`. Значение `null` означает отсутствие значения.

```fable
var name = "Alex"       // тип определяется автоматически
int age = 18
float speed = 4.5
string title = "Game"
bool ready = true
any value = null
list<int> scores = [10, 20, 30]
```

Список, объявленный через `var`, может содержать значения разных типов:

```fable
var mixed = [1, "два", true, null]
```

Повторное присваивание должно сохранять объявленный или определённый тип. `any` принимает значения любых типов.

## Операторы

Арифметика: `+`, `-`, `*`, `/`, `%`. Составные присваивания: `+=`, `-=`, `*=`, `/=`, `%=`.

Сравнения: `==`, `!=`, `<`, `>`, `<=`, `>=`. Логические операторы записываются словами: `and`, `or`, `not`.

```fable
var score = 10
score += 5

if score >= 10 and not false {
    print(score)
}
```

`+` складывает числа и соединяет строки. Для соединения строки с другим типом сначала используйте `string(value)`.

## Строки

Строки записываются в двойных или одинарных кавычках. Поддерживаются escape-последовательности `\n`, `\r`, `\t`, `\\`, `\"` и `\'`.

```fable
var text = "Fable Script"
print(text.len)
print(text.upper())
print(text.lower())
print(text.contains("Script"))
print(text.replace(" ", ""))
print(text.split(" "))
```

- `.len` — количество символов;
- `.upper()` и `.lower()` — изменение регистра;
- `.contains(text)` — проверка наличия текста;
- `.replace(old, new)` — замена всех совпадений;
- `.split(separator)` — разделение на список строк.

## Списки

Индекс начинается с нуля. Чтение элемента выполняется через квадратные скобки.

```fable
var values = [10, "текст", true]
print(values[0])
print(values.len)

values.add(20)
values.insert(1, "новое")
print(values.contains(true))
values.remove("текст")
values.clear()
```

- `.add(value)` добавляет элемент в конец;
- `.insert(index, value)` вставляет элемент перед указанным индексом;
- `.remove(value)` удаляет первое совпадение и возвращает `bool`;
- `.contains(value)` проверяет наличие элемента;
- `.clear()` очищает список;
- `.len` возвращает размер списка.

## Таблицы

Таблица хранит пары `ключ: значение`. К полю обращаются через точку.

```fable
var player = {name: "Alex", score: 10}
player.score += 5
print(player.name)
print(player.len)
print(player.keys())
print(player.values())
print(player.contains("score"))
```

- `.keys()` возвращает список ключей;
- `.values()` возвращает список значений;
- `.contains(key)` проверяет наличие ключа;
- `.len` возвращает число ключей.

Имена встроенных свойств и методов коллекций зарезервированы и не могут быть ключами таблицы.

## Условия

```fable
if age < 13 {
    print("child")
} else if age < 18 {
    print("teen")
} else {
    print("adult")
}
```

## Циклы

```fable
repeat 3 times {
    print("ещё раз")
}

var index = 0
while index < 5 {
    index += 1
}

for value in [10, 20, 30] {
    if value == 20 {
        continue
    }
    print(value)
}
```

`break` завершает ближайший цикл, `continue` переходит к следующей итерации. При переборе таблицы цикл получает её ключи.

`range(end)`, `range(start, end)` и `range(start, end, step)` создают списки целых чисел; конечное значение не включается.

## Функции

У каждого параметра обычной функции сейчас обязательно указываются тип и имя. Тип результата после `->` необязателен и может быть `int`, `float`, `string` или `bool`.

```fable
func add(int a, int b) -> int
{
    return a + b
}

print(add(2, 3))
```

Если тип результата указан, все пути выполнения функции должны вернуть совместимое значение. `return` без выражения завершает функцию без результата.

## Классы

Поля класса объявляются через `var`. Конструктор называется `__init`, текущий объект доступен через `self`. Типы параметров конструктора можно не указывать.

```fable
class Person
{
    var name
    var age

    __init(name, int age)
    {
        self.name = name
        self.age = age
    }

    func greet()
    {
        print("Привет, " + self.name)
    }
}

var person = Person("Alex", 18)
person.greet()
```

Наследования в текущей версии нет.

## Ввод, вывод и преобразования

```fable
var name = input("Имя: ")
int age = int(input("Возраст: "))
float price = float("12.5")
string message = "Возраст: " + string(age)
bool enabled = bool("true")
print(message)
```

`input()` всегда возвращает строку. `int()`, `float()`, `string()` и `bool()` выполняют явное преобразование. Ошибочное числовое преобразование создаёт ошибку выполнения.

## Обработка ошибок

```fable
try {
    int("не число")
} catch error {
    print("Ошибка: " + error)
}
```

Переменная после `catch` содержит текст ошибки и существует только внутри блока `catch`. Синтаксические ошибки и ошибки типов находятся до запуска и не перехватываются.

## Запуск другого файла

`execute()` запускает другой `.fable` рядом с текущей программой. Вторым аргументом можно указать имя экспортируемой функции, третьим — список её аргументов.

```fable
execute("IdChecker.fable")
var result = execute("IdChecker.fable", "check", ["ABC-123"])
```

Имена, начинающиеся с `_`, считаются внутренними и недоступны через другой файл или модуль.

## Запуск проекта

```text
fable new MyGame
cd MyGame
fable run
```

`fable new` создаёт `main.fable`, `fable.json` и папку `fable_modules`. Команда `fable run` без пути читает поле `entry` из `fable.json`; по умолчанию используется `main.fable`.

Для одиночного файла путь можно передать явно:

```text
fable run examples/hello.fable
```
