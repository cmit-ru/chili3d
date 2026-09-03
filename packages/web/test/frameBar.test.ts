// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: зона «человек» в полосе каркаса. Отзыв — канал сообщений об
// ошибках, и дверь в него одна и та же у всех: у ученика пунктом в меню
// человека, у гостя отдельной тихой кнопкой рядом с «Войти». Раньше кнопка
// висела в углу над рабочей областью и не нажималась; тест держит новое место.

import { FrameBar, type FrameBarOptions } from "../src/frameBar";

const опции = (over: Partial<FrameBarOptions>): FrameBarOptions => ({
    projectId: null,
    title: "Брелок",
    user: null,
    viewing: false,
    isExample: false,
    sandbox: true,
    sharedPc: false,
    saveNow: async () => {},
    hasPending: () => false,
    openConflict: () => {},
    download: {
        workTitle: () => "Брелок",
        selectedCount: () => 0,
        exportModel: async () => undefined,
        screenshot: () => undefined,
        workFile: () => undefined,
    },
    ...over,
});

const кнопка = (text: string) =>
    [...document.querySelectorAll("#frame-user button, #frame-user a")].find(
        (el) => el.textContent === text,
    ) as HTMLElement | undefined;

describe("Зона «человек» в полосе", () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="frame-work"></div><div id="frame-user"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("гость видит «Что-то не так?» слева от «Войти»", () => {
        let открыт = false;
        new FrameBar(опции({ feedback: () => (открыт = true) }));

        const отзыв = кнопка("Что-то не так?");
        const вход = кнопка("Войти");
        expect(отзыв).toBeDefined();
        expect(вход).toBeDefined();
        expect(отзыв?.compareDocumentPosition(вход as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

        отзыв?.click();
        expect(открыт).toBe(true);
    });

    test("без отзыва у гостя остаётся одна дверь — «Войти»", () => {
        new FrameBar(опции({}));
        expect(кнопка("Что-то не так?")).toBeUndefined();
        expect(кнопка("Войти")).toBeDefined();
    });
});
