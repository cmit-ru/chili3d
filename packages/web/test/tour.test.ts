// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: тур первого входа по мастерской моделей (B-278).
//
// Две половины набора. Первая гоняет сам модуль в happy-dom: шаги, слова, отметка
// гостя, закрытие тура. Вторая читает исходники текстом — как `narrowScreen.test.ts`:
// якоря тура живут в четырёх чужих файлах (лента, сцена, панель частей, полоса
// каркаса), браузера здесь нет, и переименование любого из них иначе всплыло бы
// только у ребёнка на уроке — пузырь молча уехал бы в пустоту.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "@rstest/core";
import { КЛЮЧ_ГОСТЯ, гостьВиделТур, завестиТур, запомнитьТурГостя, шагиТура } from "../src/tour";

const корень = path.resolve(__dirname, "../../..");
const читать = (...p: string[]) => readFileSync(path.join(корень, ...p), "utf8");

const селекторы = (гость: boolean) => шагиТура(гость).map((шаг) => шаг.element);

describe("тур первого входа: шаги", () => {
    test("четыре пузыря — не больше: до первой фигуры ребёнок не должен читать лекцию", () => {
        expect(шагиТура(false)).toHaveLength(4);
        expect(шагиТура(true)).toHaveLength(4);
    });

    test("каждый пузырь привязан к месту и говорит одну мысль", () => {
        for (const шаг of шагиТура(false)) {
            expect(typeof шаг.element).toBe("string");
            expect(шаг.popover?.title).toBeTruthy();
            const текст = шаг.popover?.description ?? "";
            expect(текст.length).toBeGreaterThan(0);
            // Пузырь читают между делом. Больше двух предложений — это уже
            // инструкция, а её ребёнок пролистывает не читая.
            expect(текст.split(/[.!?]\s/).length).toBeLessThanOrEqual(2);
            expect(текст.length).toBeLessThanOrEqual(120);
        }
    });

    test("порядок мест — путь ребёнка: где взять фигуру, где строить, куда она попала, цела ли работа", () => {
        expect(селекторы(false)).toEqual([
            '[data-ribbon-group="ribbon.group.draw"]',
            "chili-viewport",
            "#editor-sidebar",
            "[data-frame-state]",
        ]);
    });

    test("гостю показываем те же места, но про сохранение не врём", () => {
        expect(селекторы(true)).toEqual(селекторы(false));
        const ученику = шагиТура(false)[3].popover?.description ?? "";
        const гостю = шагиТура(true)[3].popover?.description ?? "";
        expect(ученику).toContain("сохраняется сама");
        expect(гостю).not.toContain("сохраняется сама");
        expect(гостю).toContain("не сохраняется");
    });

    test("слова — из шпаргалки «?», а не из словаря разработчика", () => {
        const всё = шагиТура(false)
            .concat(шагиТура(true))
            .map((шаг) => `${шаг.popover?.title} ${шаг.popover?.description}`)
            .join(" ")
            .toLowerCase();
        for (const чужое of ["вьюпорт", "примитив", "панель свойств", "тулбар", "сайдбар"]) {
            expect(всё).not.toContain(чужое);
        }
        // Те же слова, что в шпаргалке `frameBar.ts` (`HELP_LINES`): ребёнок не должен
        // переучиваться, переходя от пузыря к «?».
        expect(всё).toContain("лента команд");
        expect(всё).toContain("сцена");
    });
});

describe("тур первого входа: отметка гостя", () => {
    beforeEach(() => localStorage.clear());

    test("ключ — тот, о котором договорились с оболочкой", () => {
        expect(КЛЮЧ_ГОСТЯ).toBe("maketka.tour.3d");
    });

    test("не видел → видел", () => {
        expect(гостьВиделТур()).toBe(false);
        запомнитьТурГостя();
        expect(localStorage.getItem(КЛЮЧ_ГОСТЯ)).toBe("1");
        expect(гостьВиделТур()).toBe(true);
    });
});

describe("тур первого входа: запуск и уход", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        localStorage.clear();
    });

    /** Четыре места, на которые наводятся пузыри: без них шаги просто пропускаются. */
    const поставитьМеста = () => {
        document.body.innerHTML = `
            <div data-ribbon-group="ribbon.group.draw"></div>
            <chili-viewport></chili-viewport>
            <div id="editor-sidebar"></div>
            <div data-frame-state></div>
        `;
    };

    test("тур сразу рисует первый пузырь понятными словами", () => {
        поставитьМеста();
        const тур = завестиТур({ гость: false, пройден: () => {} });
        const пузырь = document.querySelector(".driver-popover");
        expect(пузырь).not.toBeNull();
        expect(пузырь?.textContent).toContain("Фигуры берут здесь");
        // Уйти можно всегда: крестик и кнопка «Дальше» стоят с первого шага.
        expect(пузырь?.textContent).toContain("Дальше");
        expect(document.querySelector(".driver-popover-close-btn")).not.toBeNull();
        expect(пузырь?.textContent).toContain("1 из 4");
        тур.destroy();
    });

    test("закрыли крестиком, не дочитав, — отметка ставится всё равно", () => {
        поставитьМеста();
        let отмечено = 0;
        завестиТур({ гость: false, пройден: () => (отмечено += 1) });
        expect(отмечено).toBe(0);
        const крестик = document.querySelector(".driver-popover-close-btn") as HTMLElement;
        крестик.click();
        expect(отмечено).toBe(1);
        expect(document.querySelector(".driver-popover")).toBeNull();
    });

    test("ушли по Esc — отметка тоже ставится", () => {
        поставитьМеста();
        let отмечено = 0;
        завестиТур({ гость: false, пройден: () => (отмечено += 1) });
        window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
        expect(отмечено).toBe(1);
        expect(document.querySelector(".driver-popover")).toBeNull();
    });
});

describe("тур первого входа: якоря совпадают с живым кодом", () => {
    test("лента команд помечает группу своим ключом, и группа «Фигуры» так и зовётся", () => {
        expect(читать("packages", "ui", "src", "ribbon", "ribbonGroup.ts")).toContain(
            'this.dataset["ribbonGroup"] = group.groupName',
        );
        expect(читать("packages", "builder", "src", "ribbon.ts")).toContain('groupName: "ribbon.group.draw"');
    });

    test("сцена — тот самый пользовательский элемент", () => {
        expect(читать("packages", "ui", "src", "viewport", "layoutViewport.ts")).toContain(
            'customElements.define("chili-viewport"',
        );
    });

    test("список частей модели — тот самый id", () => {
        expect(читать("packages", "ui", "src", "editor.ts")).toContain('id: "editor-sidebar"');
    });

    test("состояние сохранения — та самая опора каркаса", () => {
        expect(читать("packages", "web", "src", "frameBar.ts")).toContain(
            'this.stateText.dataset["frameState"] = ""',
        );
    });
});

describe("тур первого входа: подключение в мастерской", () => {
    const индекс = () => читать("packages", "web", "src", "index.ts");

    test("подсказка первого входа выпилена целиком — вместе с файлом", () => {
        const код = индекс();
        expect(код).not.toContain("FirstHint");
        expect(код).not.toContain("showHint");
        expect(код).not.toContain("hint-seen");
        // Файл не остался лежать без дела: карточки в углу больше нет ни в бандле,
        // ни в исходниках. Ручку `POST /api/hint-seen` убирает оболочка.
        expect(existsSync(path.join(корень, "packages", "web", "src", "firstHint.ts"))).toBe(false);
    });

    test("признак приезжает полем showTour, а отметка уходит узкой ручкой", () => {
        const код = индекс();
        expect(код).toContain("showTour?: boolean");
        expect(код).toMatch(/if \(!meta\?\.showTour\) return;/);
        expect(код).toContain('fetch("/api/tour-seen"');
        expect(код).toContain('JSON.stringify({ kind: "3d" })');
    });

    test("гость в пробе — отдельная ветка, а не расширение меты", () => {
        // Ранний выход песочницы в `openProject` стоит до запроса меты: `showTour`
        // гостю приехать физически неоткуда, признак ему хранит браузер.
        const код = индекс();
        expect(код).toMatch(
            /if \(!projectId\(\) && sandboxFromLocation\(\)\) \{[\s\S]{0,200}гостьВиделТур\(\)[\s\S]{0,200}запомнитьТурГостя/,
        );
    });

    test("тур начинается с готовой мастерской, а не поверх накладки «Собираем модель…»", () => {
        const код = индекс();
        // Накладка спиннера лежит поверх всего окна, пузырь — ещё выше неё.
        expect(код).toMatch(/spinner\.remove\(\);[\s\S]{0,700}показатьТур\(earlyMeta\);/);
        expect(код).not.toMatch(/показатьТур\(earlyMeta\);[\s\S]{0,700}spinner\.remove\(\);/);
    });
});
