// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Поле ввода размера со стороны пальца (B-317). До этой правки на чистом планшете
 * размер числом не задавался вовсе: поле открывалось только цифрой с клавиатуры, а
 * ткнуть в него мешал сам вид — он гасит `pointerdown` по всему холсту и снимает
 * фокус с активного элемента. Здесь сторожатся обе половины лечения: указатель,
 * попавший в поле, дальше не идёт, и мишени хватает пальцу.
 *
 * Размеры живут в CSS, браузера в наборе нет — эта часть читает файлы текстом, как
 * в `treeMoveButtons.test.ts`. Комментарии срезаются: в них те же слова, что в
 * правилах, и проверка проходила бы на сломанном файле.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Result } from "@chili3d/core";
import { afterEach, describe, expect, test } from "@rstest/core";
import { Input } from "../src/viewport/flyout/input";

const ТИПЫ = ["pointerdown", "pointermove", "pointerup"];

let сцена: HTMLElement | undefined;

afterEach(() => {
    сцена?.remove();
    сцена = undefined;
});

/** Вид под запиской: сюда бы ушли события, если бы поле их пропускало. */
function видСПолем() {
    сцена = document.createElement("div");
    const дошло: string[] = [];
    for (const тип of ТИПЫ) {
        сцена.addEventListener(тип, (e) => дошло.push(e.type));
    }
    const поле = new Input("", () => Result.ok(""));
    сцена.append(поле);
    document.body.append(сцена);
    return { поле, дошло };
}

describe("касание в поле ввода размера не достаётся сцене", () => {
    test("ни нажатие, ни ведение, ни отпускание не доходят до вида", () => {
        const { поле, дошло } = видСПолем();

        for (const тип of ТИПЫ) {
            поле.dispatchEvent(new Event(тип, { bubbles: true }));
        }

        expect(дошло).toEqual([]);
    });

    test("а из соседнего элемента — доходят: всплытие в наборе работает", () => {
        // Иначе первая проверка была бы зелёной и без правки.
        const { дошло } = видСПолем();
        const соседка = document.createElement("div");
        сцена?.append(соседка);

        for (const тип of ТИПЫ) {
            соседка.dispatchEvent(new Event(тип, { bubbles: true }));
        }

        expect(дошло).toEqual(ТИПЫ);
    });
});

describe("мишени ввода числа хватает пальцу", () => {
    const css = (файл: string) =>
        readFileSync(path.resolve(__dirname, файл), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    /** Тело блока `@media <условие>` — до закрывающей скобки в начале строки. */
    const приУсловии = (текст: string, условие: string) => {
        const кусок = текст.split("@media ").find((ч) => ч.startsWith(условие));
        return кусок ? кусок.split(/^\}/m)[0] : "";
    };

    test("поле размера — 44 px, и шрифт 16, чтобы iOS не увеличивал страницу", () => {
        // 16 px — не про вид: при фокусе в поле мельче iOS увеличивает страницу, а
        // вернуть масштаб нечем — щипок в редакторе запрещён.
        const блок = приУсловии(css("../src/viewport/flyout/input.module.css"), "(pointer: coarse)");
        expect(блок).toMatch(/min-height:\s*44px/);
        expect(блок).toMatch(/font-size:\s*16px/);
    });

    const КНОПКА = css("../src/ribbon/commandContext.module.css");

    test("без касания кнопки «Ввести число» нет вовсе", () => {
        // Мышью число набирают прямо в сцене: кнопка отняла бы место в полосе команды
        // ни за что (ADR 2026-09-14-1530).
        const базовое = /\.numberButton \{([^}]*)\}/.exec(КНОПКА.split("@media ")[0])?.[1];
        expect(базовое).toBeTruthy();
        expect(базовое).toMatch(/display:\s*none/);
    });

    test("любой грубый указатель — кнопка появляется", () => {
        expect(приУсловии(КНОПКА, "(any-pointer: coarse)")).toMatch(
            /\.numberButton\s*\{[^}]*display:\s*inline-flex/,
        );
    });

    test("основной указатель грубый — мишень не ниже 44 px", () => {
        expect(приУсловии(КНОПКА, "(pointer: coarse)")).toMatch(/\.numberButton\s*\{[^}]*min-height:\s*44px/);
    });
});
