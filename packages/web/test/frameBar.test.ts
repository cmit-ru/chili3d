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

    // B-141: ответ на обращение приходит в кабинет, а ребёнок из мастерской не
    // выходит. Точка на кнопке человека — единственное место, где он про ответ
    // узнает; «Что-то не так?» лежит в закрытом меню и одна там не видна.
    const точки = () => document.querySelectorAll("#frame-user [data-fb-dot]").length;
    const ученик = (over: Partial<FrameBarOptions> = {}) =>
        опции({
            projectId: "7",
            sandbox: false,
            user: { name: "Аня", avatar: "🙂", role: "student" },
            feedback: () => {},
            ...over,
        });

    test("ответов нет — точки нет", () => {
        new FrameBar(ученик());
        expect(точки()).toBe(0);
        (document.querySelector("[data-frame-user]") as HTMLElement).click();
        expect(document.querySelectorAll("[data-frame-menu] [data-fb-dot]")).toHaveLength(0);
    });

    test("у гостя точки не бывает: обращений у него нет", () => {
        new FrameBar(опции({ feedback: () => {}, unread: 3 }));
        expect(точки()).toBe(0);
    });

    test("есть непрочитанный ответ — точка на кнопке человека и на пункте меню", () => {
        new FrameBar(ученик({ unread: 2 }));
        const человек = document.querySelector("[data-frame-user]") as HTMLElement;
        expect(точки()).toBe(1);
        expect(человек.title).toBe("Вам ответили");

        человек.click();
        const пункт = [...document.querySelectorAll("[data-frame-menu] [role='menuitem']")].find((el) =>
            el.textContent?.startsWith("Что-то не так?"),
        ) as HTMLElement;
        expect(пункт.querySelector("[data-fb-dot]")).not.toBeNull();
    });

    test("ответ прочитан — точка гаснет и подсказка возвращается", () => {
        const frame = new FrameBar(ученик({ unread: 1 }));
        const человек = document.querySelector("[data-frame-user]") as HTMLElement;
        frame.setUnread(0);
        expect(точки()).toBe(0);
        expect(человек.title).toBe("");
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
            "Удалить эту модель",
        ]);

        // Второе нажатие закрывает — меню на странице всегда одно.
        файл.click();
        expect(document.querySelector("[data-frame-menu]")).toBeNull();
    });

    // B-254: «Удалить эту модель» — единственный пункт, после которого работа
    // закрывается, поэтому он стоит последним и за чертой. Убрать можно только свою
    // сохранённую работу; там, где нельзя, пункт приглушён и объясняет себя.
    test("«Удалить эту модель» стоит последним и спрашивает про корзину", async () => {
        const запросы: string[] = [];
        const было = globalThis.fetch;
        globalThis.fetch = (async (url: string, init: RequestInit) => {
            запросы.push(`${url} ${String(init.body)}`);
            return {
                ok: false,
                status: 403,
                json: async () => ({ ok: false, message: "Эту работу убирает тот, чья она." }),
            } as unknown as Response;
        }) as typeof globalThis.fetch;

        try {
            new FrameBar(своя({ csrf: "пропуск" }));
            (document.querySelector("[data-frame-file]") as HTMLElement).click();
            const пункты = [...document.querySelectorAll("[data-frame-menu] [role='menuitem']")];
            const удалить = пункты[пункты.length - 1] as HTMLElement;
            expect(удалить.textContent).toBe("Удалить эту модель");
            expect(удалить.getAttribute("aria-disabled")).toBeNull();

            удалить.click();
            const окно = document.querySelector("[aria-modal='true']") as HTMLElement;
            expect(окно.textContent).toContain("Удалить эту модель?");
            expect(окно.textContent).toContain("Работа полежит в корзине");

            const кнопки = [...окно.querySelectorAll("button")];
            const убрать = кнопки.find((b) => b.textContent === "Убрать в корзину") as HTMLElement;
            expect(кнопки.some((b) => b.textContent === "Отмена")).toBe(true);

            убрать.click();
            await new Promise((готово) => setTimeout(готово, 0));

            // Запрос — та же ручка оболочки, что у крестика на плитке, и с пропуском.
            expect(запросы).toEqual([`/projects/7/delete ${new URLSearchParams({ csrf: "пропуск" })}`]);
            // Отказ сервера — его словами, и окно остаётся: страница живая.
            expect(document.querySelector("[aria-modal='true']")).not.toBeNull();
            expect(окно.textContent).toContain("Эту работу убирает тот, чья она.");
        } finally {
            globalThis.fetch = было;
        }
    });

    test("в песочнице удалять нечего: пункт приглушён и говорит почему", () => {
        new FrameBar(опции({}));
        (document.querySelector("[data-frame-file]") as HTMLElement).click();
        const пункты = [...document.querySelectorAll("[data-frame-menu] [role='menuitem']")];
        const удалить = пункты[пункты.length - 1] as HTMLElement;
        expect(удалить.textContent).toBe("Удалить эту модель");
        expect(удалить.getAttribute("aria-disabled")).toBe("true");

        удалить.click();
        expect(document.querySelector("[aria-modal='true']")).toBeNull();
        const слово = document.querySelector('[data-banner-key="menu-reason"]') as HTMLElement;
        expect(слово.textContent).toContain("В песочнице работы ещё нет — удалять нечего");
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

// Форк «Макетки»: полоса говорила «Сохранено» всегда — и сразу после правки, и
// когда правка потом пропадала при перезагрузке (B-208). Слово «Сохранено»
// имеет право появляться только после ответа сервера.
describe("Слово о сохранении не забегает вперёд сервера", () => {
    const своя = (over: Partial<FrameBarOptions> = {}) =>
        опции({
            projectId: "7",
            sandbox: false,
            user: { name: "Аня", avatar: "", role: "ученик" },
            ...over,
        });

    const слово = () => document.querySelector("[data-frame-state]")?.textContent;

    beforeEach(() => {
        document.body.innerHTML = '<div id="frame-work"></div><div id="frame-user"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("правка в очереди — «Сохраняю…»; «Сохранено» возвращает только сервер", () => {
        const полоса = new FrameBar(своя());
        expect(слово()).toBe("✓ Сохранено");

        полоса.markPending();
        expect(слово()).toBe("◌ Сохраняю…");

        полоса.setSaveState("saved");
        expect(слово()).toBe("✓ Сохранено");
    });

    test("тревожное слово правка не перебивает", () => {
        const полоса = new FrameBar(своя());
        полоса.setSaveState("offline");
        полоса.markPending();
        expect(слово()).toBe("! Нет интернета");

        полоса.setSaveState("conflict");
        полоса.markPending();
        expect(слово()).toBe("! Не могу сохранить — работа открыта ещё где-то");
    });
});
