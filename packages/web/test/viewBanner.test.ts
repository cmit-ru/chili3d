// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: выход из режима правки (B-257).
//
// Наставник нажимал «Править» и оставался в этом режиме до перезагрузки: плашка
// честно говорила, в чьей работе идут изменения, но кнопок в ней не было вовсе.
// Пока он там, ученик свою работу не правит (B-262) — значит, дверь наружу нужна
// не для удобства, а чтобы не запирать ребёнка на весь урок.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { ViewBanner, type ViewBannerOptions } from "../src/viewBanner";

const кнопка = (text: string) =>
    [...document.querySelectorAll("button")].find((el) => el.textContent === text);

const плашка = () => document.querySelector('[data-frame-group="mode"]') as HTMLElement;

describe("плашка чужой работы", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const открыть = (over: Partial<ViewBannerOptions> = {}) => {
        let вышел = 0;
        const banner = new ViewBanner({
            ownerName: "Аня С.",
            canEdit: true,
            onEdit: () => {},
            onStopEdit: async () => {
                вышел += 1;
            },
            onCopy: async () => null,
            ...over,
        });
        return { banner, вышел: () => вышел };
    };

    test("в правке видно, чья это работа, и есть дверь наружу", () => {
        открыть();
        кнопка("Править")?.click();

        expect(плашка().textContent).toContain("Вы правите работу: Аня С.. Изменения сохраняются к ученику.");
        expect(кнопка("Выйти из правки")).toBeDefined();
    });

    test("выход возвращает просмотр — и слова, и кнопки", async () => {
        const { вышел } = открыть();
        кнопка("Править")?.click();

        кнопка("Выйти из правки")?.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(вышел()).toBe(1);
        expect(плашка().textContent).toContain("Чужая работа — сохрани копию себе");
        expect(кнопка("Править")).toBeDefined();
        expect(кнопка("Забрать себе")).toBeDefined();
        expect(кнопка("Выйти из правки")).toBeUndefined();
    });

    test("без права править дверь в правку не показывается вовсе", () => {
        открыть({ canEdit: false });
        expect(кнопка("Править")).toBeUndefined();
        expect(кнопка("Забрать себе")).toBeDefined();
    });
});
