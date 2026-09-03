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

// Меню работы открывает отдельная дверь «Файл ▾» сразу за именем, а щелчок по
// самому имени правит имя (`frame-contract.md`, «Меню работы»). Раньше меню
// пряталось за названием: «Сохранить», «Сделать копию» и «Переименовать» за ним
// не находили, а от названия ждут правки названия.
describe("Зона «работа» в полосе", () => {
    const своя = (over: Partial<FrameBarOptions> = {}) =>
        опции({
            projectId: "7",
            sandbox: false,
            user: { name: "Аня", avatar: "", role: "ученик" },
            ...over,
        });

    const якорь = (el: Element) => {
        const data = (el as HTMLElement).dataset;
        if (data["frameName"] !== undefined) return "имя";
        if (data["frameFile"] !== undefined) return "файл";
        if (data["frameState"] !== undefined) return "состояние";
        return "";
    };

    beforeEach(() => {
        document.body.innerHTML = '<div id="frame-work"></div><div id="frame-user"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("порядок в зоне: имя, «Файл ▾», состояние", () => {
        new FrameBar(своя());
        const зона = document.getElementById("frame-work") as HTMLElement;
        expect([...зона.children].map(якорь).slice(0, 3)).toEqual(["имя", "файл", "состояние"]);
    });

    test("щелчок по имени открывает правку имени, а не меню", () => {
        new FrameBar(своя());
        (document.querySelector("[data-frame-name]") as HTMLElement).click();

        expect(document.querySelector("[data-frame-menu]")).toBeNull();
        const поле = document.querySelector("#frame-work input") as HTMLInputElement | null;
        expect(поле).not.toBeNull();
        expect(поле?.value).toBe("Брелок");
    });

    test("меню работы открывает кнопка «Файл ▾», и пункты идут по контракту", () => {
        new FrameBar(своя());
        const файл = document.querySelector("[data-frame-file]") as HTMLElement;
        expect(файл.textContent).toBe("Файл ▾");

        файл.click();
        const меню = document.querySelector("[data-frame-menu]");
        expect(меню).not.toBeNull();
        expect(меню?.getAttribute("aria-label")).toBe("Эта работа");
        expect(
            [...(меню as HTMLElement).querySelectorAll("[role='menuitem']")].map((el) => el.textContent),
        ).toEqual([
            "Переименовать",
            "Сохранить сейчас",
            "Сделать копию",
            "Открыть другую работу…",
            "Создать новую работу…",
            "Скачать…",
        ]);

        // Второе нажатие закрывает — меню на странице всегда одно.
        файл.click();
        expect(document.querySelector("[data-frame-menu]")).toBeNull();
    });

    // Нажатие, от которого ничего не происходит, ребёнок считает поломкой.
    test("в песочнице имя не правится и говорит почему", () => {
        new FrameBar(опции({}));
        (document.querySelector("[data-frame-name]") as HTMLElement).click();

        expect(document.querySelector("#frame-work input")).toBeNull();
        const подсказка = document.querySelector("#frame-work div") as HTMLElement;
        expect(подсказка.hidden).toBe(false);
        expect(подсказка.textContent).toBe("В песочнице работы ещё нет — сначала сохрани её себе");
    });
});
