// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: работа открывается тем же ракурсом, каким её закрыли (просьба
// владельца 06.09.2026). Проверяем три обещания: нетронутый вид не пишем,
// повёрнутый пишем один раз, и при уходе со страницы ракурс всё-таки уезжает.

import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { ViewMemory, type Ракурс, применитьРакурс } from "../src/viewMemory";

const РАКУРС: Ракурс = {
    eye: [100, 100, 100],
    target: [0, 0, 0],
    up: [0, 0, 1],
    type: "perspective",
};

function цель(первый: Ракурс = РАКУРС) {
    const отправлено: Ракурс[] = [];
    const наЗакрытии: boolean[] = [];
    let текущий: Ракурс | undefined = первый;
    return {
        отправлено,
        наЗакрытии,
        повернуть: (ракурс: Ракурс | undefined) => {
            текущий = ракурс;
        },
        target: {
            camera: () => текущий,
            send: async (ракурс: Ракурс, closing?: boolean) => {
                отправлено.push(ракурс);
                наЗакрытии.push(Boolean(closing));
            },
        },
    };
}

describe("память вида", () => {
    beforeEach(() => {
        rs.useFakeTimers();
    });

    afterEach(() => {
        rs.useRealTimers();
    });

    test("вид не трогали — писать нечего", () => {
        const { target, отправлено } = цель();
        const память = new ViewMemory(target, 15_000);
        память.start();

        rs.advanceTimersByTime(120_000);

        expect(отправлено).toEqual([]);
        память.stop();
    });

    test("вид повернули — уходит один раз, пока его не повернут снова", async () => {
        const { target, отправлено, повернуть } = цель();
        const память = new ViewMemory(target, 15_000);
        память.start();

        const повёрнутый: Ракурс = { ...РАКУРС, eye: [50, 0, 20] };
        повернуть(повёрнутый);
        rs.advanceTimersByTime(15_000);
        await Promise.resolve();
        expect(отправлено).toEqual([повёрнутый]);

        // Тот же ракурс следующие такты не повторяем.
        rs.advanceTimersByTime(60_000);
        await Promise.resolve();
        expect(отправлено.length).toBe(1);

        повернуть({ ...повёрнутый, type: "orthographic" });
        rs.advanceTimersByTime(15_000);
        await Promise.resolve();
        expect(отправлено.length).toBe(2);
        память.stop();
    });

    test("при уходе со страницы ракурс уезжает сразу", async () => {
        const { target, отправлено, наЗакрытии, повернуть } = цель();
        const память = new ViewMemory(target, 15_000);
        память.start();
        повернуть({ ...РАКУРС, eye: [7, 7, 7] });

        window.dispatchEvent(new Event("pagehide"));
        await Promise.resolve();

        expect(отправлено.length).toBe(1);
        // Обычный запрос браузер на уходе со страницы обрывает.
        expect(наЗакрытии).toEqual([true]);
        память.stop();
    });

    test("после stop таймер и уход со страницы молчат", async () => {
        const { target, отправлено, повернуть } = цель();
        const память = new ViewMemory(target, 15_000);
        память.start();
        память.stop();
        повернуть({ ...РАКУРС, eye: [1, 2, 3] });

        rs.advanceTimersByTime(60_000);
        window.dispatchEvent(new Event("pagehide"));
        await Promise.resolve();

        expect(отправлено).toEqual([]);
    });

    test("не дошло — следующий такт пробует снова", async () => {
        const отправлено: Ракурс[] = [];
        let падать = true;
        let текущий: Ракурс = { ...РАКУРС, eye: [3, 3, 3] };
        const память = new ViewMemory(
            {
                camera: () => текущий,
                send: async (ракурс: Ракурс) => {
                    if (падать) throw new Error("сети нет");
                    отправлено.push(ракурс);
                },
            },
            15_000,
        );
        текущий = РАКУРС;
        память.start();
        текущий = { ...РАКУРС, eye: [3, 3, 3] };

        rs.advanceTimersByTime(15_000);
        await Promise.resolve();
        expect(отправлено).toEqual([]);

        падать = false;
        rs.advanceTimersByTime(15_000);
        await Promise.resolve();
        expect(отправлено.length).toBe(1);
        память.stop();
    });
});

describe("применитьРакурс", () => {
    function камера() {
        const поставлено: unknown[] = [];
        return {
            поставлено,
            controller: {
                cameraType: "perspective",
                lookAt: (eye: unknown, target: unknown, up: unknown) => {
                    поставлено.push({ eye, target, up });
                },
            } as any,
        };
    }

    test("целый ракурс ставится, род камеры тоже", () => {
        const { controller, поставлено } = камера();
        expect(применитьРакурс(controller, { ...РАКУРС, type: "orthographic" })).toBe(true);
        expect(controller.cameraType).toBe("orthographic");
        expect(поставлено).toEqual([
            { eye: { x: 100, y: 100, z: 100 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
        ]);
    });

    test("битый или пустой ракурс не ставится — наводить будет вызывающий", () => {
        for (const плохо of [
            null,
            undefined,
            "нет",
            {},
            { ...РАКУРС, up: [0, 1] },
            { ...РАКУРС, eye: [1, 2, "три"] },
            { ...РАКУРС, target: [Number.NaN, 0, 0] },
        ]) {
            const { controller, поставлено } = камера();
            expect(применитьРакурс(controller, плохо)).toBe(false);
            expect(поставлено).toEqual([]);
        }
    });
});
