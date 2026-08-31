# Сторонние компоненты редактора

Перечень всего, что попадает в собираемый бандл редактора и в его образ, с версиями,
правообладателями, лицензиями и ролью каждого компонента. Плюс инструменты, использованные
при создании: методика оператора реестра требует оба списка.

Зачем документ: при включении в единый реестр российского ПО экспертиза проверяет, что
заявитель соблюдает условия использования компонентов (подпункт «б» пункта 5 Правил,
утверждённых постановлением Правительства РФ от 16.11.2015 № 1236). Отказы по этому основанию
реальны — заявление ООО «Базальт СПО» по продукту «Свободный офис» отклонено 15.04.2026
в том числе по этому подпункту.

## Основа

| Компонент | Версия | Лицензия | Что с ним сделано | Обязательства и как выполняются |
|---|---|---|---|---|
| **Chili3D** | форк от 0.7.0 | AGPL-3.0 | Переработан: облачное хранение вместо IndexedDB, автосохранение и ревизии, панель шагов урока, экран-замок, подсказка первого входа, русский по умолчанию, упрощённая лента команд, удалены все пути исполнения стороннего кода | Исходный текст форка опубликован: <https://github.com/cmit-ru/chili3d>. Точная версия работающей сборки — `/3d/source.txt`, предложение исходников в интерфейсе (`/3d/source`). Уведомления об авторских правах сохранены, изменения обозначены в истории коммитов |
| **chili-wasm** | из состава форка | LGPL-3.0 | Пересобран с `-sDISABLE_EXCEPTION_CATCHING=0`, чтобы невозможная геометрия не обрывала модуль | Исходный текст в том же репозитории (`cpp/`), текст лицензии — `cpp/LICENSE-chili-wasm.txt`. Пересборка возможна: инструкция в `cpp/README.md` |
| **Open CASCADE Technology (OCCT)** | см. `cpp/build/occt` | LGPL-2.1 + исключение Open CASCADE (версия 1.0) | Собирается из исходников в WebAssembly, код библиотеки не изменялся | **Продукт использует Open CASCADE Technology** — указание требуется исключением и приведено также на странице «О программе» оболочки. Совместимость с AGPL-3.0 обеспечивается §3 LGPL-2.1 (перевод копии на условия GPL-3.0) |

## Полный перечень

Считается по составу репозитория (package.json корня и всех рабочих пакетов), а не
пишется руками: список, который поддерживают вручную, расходится с поставкой молча.
Пересчитать — `npm run third-party`, сверить — `npm run check:third-party` (гейт CI:
новая зависимость без записи роняет сборку).

<!-- ПЕРЕЧЕНЬ-НАЧАЛО: раздел считается скриптом scripts/third-party.mjs, руками не править -->

Всего компонентов: 23. Пересчитывается командой `npm run third-party`.

### Компоненты вне npm

| Компонент | Версия | Правообладатель | Лицензия | Где используется | Источник |
|---|---|---|---|---|---|
| Chili3D (исходный проект) | форк от 0.7.0 | xiange (仙阁) и участники проекта | AGPL-3.0-or-later | Основа редактора; переработан (см. README, «Что изменено») | https://github.com/xiangechen/chili3d |
| Open CASCADE Technology | см. cpp/build/occt | Open CASCADE SAS | LGPL-2.1 с исключением Open CASCADE (версия 1.0) | Геометрическое ядро, собирается в WebAssembly; код не изменялся | https://dev.opencascade.org/resources/licensing |
| Emscripten | по инструкции cpp/README.md | Emscripten authors и участники проекта | MIT / University of Illinois NCSA (двойная) | Компиляция ядра в WebAssembly (в поставку не входит) | https://github.com/emscripten-core/emscripten/blob/main/LICENSE |
| nginx | stable | Nginx, Inc. и участники проекта | BSD-2-Clause | Отдача статики редактора (образ deploy/Dockerfile) | https://nginx.org/LICENSE |
| Node.js | 22 | OpenJS Foundation | MIT (плюс лицензии компонентов рантайма) | Среда сборки (в поставку не входит) | https://github.com/nodejs/node/blob/main/LICENSE |

### Пакеты npm

| Компонент | Версия | Правообладатель | Лицензия | Где используется | Источник |
|---|---|---|---|---|---|
| @types/jszip | 3.4.0 | Microsoft Corporation | MIT | В браузере (бандл редактора) | https://github.com/Stuk/jszip |
| jszip | 3.10.1 | Stuart Knightley | (MIT OR GPL-3.0-or-later) | В браузере (бандл редактора) | https://github.com/Stuk/jszip |
| @biomejs/biome | 2.4.15 | Emanuele Stoppa | MIT OR Apache-2.0 | Инструмент сборки (в поставку не входит) | https://github.com/biomejs/biome |
| @rspack/cli | 2.0.3 | -present Bytedance, Inc. and its affiliates | MIT | Инструмент сборки (в поставку не входит) | https://github.com/web-infra-dev/rspack |
| @rspack/core | 2.0.3 | -present Bytedance, Inc. and its affiliates | MIT | Инструмент сборки (в поставку не входит) | https://github.com/web-infra-dev/rspack |
| @rspack/dev-server | 2.0.1 | -present Bytedance, Inc. and its affiliates | MIT | Инструмент сборки (в поставку не входит) | https://github.com/rstackjs/rspack-dev-server |
| @rstest/core | 0.10.0 | -present ByteDance, Inc. and its affiliates | MIT | Инструмент сборки (в поставку не входит) | https://github.com/web-infra-dev/rstest |
| @rstest/coverage-istanbul | 0.10.0 | Travis Zhang | MIT | Инструмент сборки (в поставку не входит) | https://github.com/web-infra-dev/rstest |
| @types/three | 0.184.1 | Josh Ellis | MIT | Инструмент сборки (в поставку не входит) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| clang-format | 1.8.0 | Alex Eagle | Apache-2.0 | Инструмент сборки (в поставку не входит) | git@github.com:angular/clang-format |
| happy-dom | 20.9.0 | David Ortner | MIT | Инструмент сборки (в поставку не входит) | https://github.com/capricorn86/happy-dom |
| lint-staged | 17.0.5 | Andrey Okonetchnikov | MIT | Инструмент сборки (в поставку не входит) | https://github.com/lint-staged/lint-staged |
| simple-git-hooks | 2.13.1 | Mikhail Gorbunov | MIT | Инструмент сборки (в поставку не входит) | https://github.com/toplenboren/simple-git-hooks |
| three | 0.184.0 | mrdoob | MIT | Инструмент сборки (в поставку не входит) | https://github.com/mrdoob/three.js |
| three-mesh-bvh | 0.9.0 | Garrett Johnson | MIT | Инструмент сборки (в поставку не входит) | https://github.com/gkjohnson/three-mesh-bvh |
| ts-checker-rspack-plugin | 1.3.0 | -present Rspack Contrib | MIT | Инструмент сборки (в поставку не входит) | https://github.com/rstackjs/ts-checker-rspack-plugin |
| typescript | 6.0.3 | Microsoft Corp. | Apache-2.0 | Инструмент сборки (в поставку не входит) | https://github.com/microsoft/TypeScript |
| typescript-plugin-css-modules | 5.2.0 | Brody McKee | MIT | Инструмент сборки (в поставку не входит) | https://github.com/mrmckeb/typescript-plugin-css-modules |

<!-- ПЕРЕЧЕНЬ-КОНЕЦ -->

Обязательство по всем разрешительным лицензиям в перечне одно и то же: сохранять
уведомления об авторских правах и текст лицензии. Тексты — в `node_modules/<пакет>/`.
JSZip распространяется по двойной лицензии (MIT или GPLv3) и используется **по MIT**.

## Чего в бандле нет намеренно

- Загрузки и исполнения стороннего кода в любом виде: удалены `PluginManager`, разбор
  параметров `?plugin=`, `?url=`, `?model=`, метод `loadFileFromUrl`, автозагрузка `plugins.json`
  (инвариант INV-006 проекта).
- Сторонних трекеров и аналитики.
- Обращений к внешним хостам в рантайме: проверяется в CI по списку хостов в собранной
  директории `dist/`.

## Как проверять актуальность

1. `npm run third-party` — пересчитать перечень; `npm run check:third-party` — сверить.
2. Тексты лицензий читать в `node_modules/<пакет>/LICENSE*`, а не по значкам в README.
3. При обновлении форка сверять, не появились ли новые внешние обращения.
