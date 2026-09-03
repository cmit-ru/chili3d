// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: экран-замок. Проверяем ровно то, что сверяет браузерная спека
// паритета двух мастерских (`agent_docs/frame-contract.md`, раздел «Экран-замок»):
// зацепку на корне и слово второй кнопки. Ребёнку «Выйти» не говорят нигде —
// на общем компьютере он «Передаёт компьютер», на своём отвечает «Это не я».

import { describe, expect, test } from "@rstest/core";
import { ScreenLock } from "../src/screenLock";

/** Поднять замок: порог 0 минут — таймер срабатывает ближайшим тиком. */
async function поднять(sharedPc: boolean) {
    document.body.innerHTML = "";
    new ScreenLock({
        minutes: 0,
        sharedPc,
        userName: "Аня",
        userAvatar: "🙂",
        hasUnsaved: () => false,
        flush: async () => {},
    });
    await new Promise((done) => setTimeout(done, 0));
    const lock = document.querySelector("[data-frame-lock]");
    if (!lock) throw new Error("замок не поднялся");
    return lock;
}

describe("ScreenLock", () => {
    test("общий компьютер класса: вторая кнопка предлагает уступить место", async () => {
        const lock = await поднять(true);
        const words = [...lock.querySelectorAll("button")].map((b) => b.textContent);
        expect(words).toContain("Это я, продолжить");
        expect(words).toContain("Передать компьютер");
        expect(words).not.toContain("Выйти");
    });

    test("свой компьютер: та же кнопка спрашивает, тот ли это человек", async () => {
        const lock = await поднять(false);
        const words = [...lock.querySelectorAll("button")].map((b) => b.textContent);
        expect(words).toContain("Это не я");
        expect(words).not.toContain("Передать компьютер");
    });

    test("заголовок называет хозяина места", async () => {
        const lock = await поднять(true);
        expect(lock.textContent).toContain("Здесь работает Аня");
    });
});
