// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: панель шагов урока сворачивается по клику в заголовок.
// Тест стоит здесь, потому что поломка была невидимой для типов: `hidden`
// проставлялся, а список оставался на экране — инлайновый `display: grid`
// сильнее правила браузера `[hidden] { display: none }`.
//
// Второе, что держит этот файл, — где живут отметки (B-118). Занятия идут на
// общих компьютерах класса: галочки обязаны переезжать за учеником и не должны
// доставаться тому, кто сядет за эту машину следующим.

import { LessonPanel } from "../src/lessonPanel";

const card = {
    slug: "brelok",
    title: "Брелок",
    steps: ["Поставь коробку", "Скругли углы"],
    minutes: 40,
};

interface Запрос {
    url: string;
    method: string;
    body: string;
}

/** Ответ сервера панели нужен разобранным — большего она от него не хочет. */
const ответ = (status: number, data: unknown) =>
    Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(data),
    } as unknown as Response);

/** Запрос к серверу уходит обещанием — даём микрозадачам провернуться. */
const провернуть = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** Такт отправки — 800 мс; ждём с запасом. */
const переждатьТакт = () => new Promise((r) => setTimeout(r, 1000));

const щёлкнуть = (index: number) => {
    const box = document.querySelectorAll("aside input")[index] as HTMLInputElement;
    box.checked = !box.checked;
    box.dispatchEvent(new Event("change"));
};

const отмечено = (index: number) =>
    (document.querySelectorAll("aside input")[index] as HTMLInputElement).checked;

describe("Панель шагов урока", () => {
    const запросы: Запрос[] = [];
    let ответСервера: unknown = { done: null };
    let код = 200;

    beforeEach(() => {
        запросы.length = 0;
        ответСервера = { done: null };
        код = 200;
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            запросы.push({
                url: String(url),
                method: init?.method ?? "GET",
                body: String(init?.body ?? ""),
            });
            return ответ(код, ответСервера);
        }) as typeof fetch;
    });

    afterEach(() => {
        document.body.innerHTML = "";
        localStorage.clear();
    });

    /** У каждого теста своя работа: отложенный запрос соседнего теста мог бы
     *  доехать в чужой такт и сбить счёт. */
    const отправленное = (работа: string) =>
        запросы.filter((з) => з.method === "POST" && з.url.includes(`/${работа}/`));

    test("клик по заголовку сворачивает и разворачивает список", () => {
        new LessonPanel(card, "42", "7");
        const header = document.querySelector("aside button") as HTMLButtonElement;
        const list = document.querySelector("aside ol") as HTMLOListElement;

        expect(list.style.display).toBe("grid");

        header.click();
        expect(list.hidden).toBe(true);
        expect(list.style.display).toBe("none");

        header.click();
        expect(list.hidden).toBe(false);
        expect(list.style.display).toBe("grid");
    });

    test("панель встаёт первым блоком левой колонки", () => {
        const sidebar = document.createElement("div");
        sidebar.id = "editor-sidebar";
        const tree = document.createElement("div");
        sidebar.append(tree);
        document.body.append(sidebar);

        new LessonPanel(card, "42", "7");

        expect(sidebar.firstChild).toBe(document.querySelector("aside"));
        expect(sidebar.children.length).toBe(2);
    });

    test("отметки шагов привязаны к ученику, а не только к работе", async () => {
        new LessonPanel(card, "43", "7");
        await провернуть();
        щёлкнуть(0);

        expect(localStorage.getItem("maketka.lesson.7.43")).toContain('"done":[0]');
        // Сосед за тем же компьютером чужих галочек не видит.
        expect(localStorage.getItem("maketka.lesson.8.43")).toBeNull();
    });

    test("отметки уходят на сервер, но одним запросом на серию кликов", async () => {
        new LessonPanel(card, "44", "7");
        await провернуть();

        щёлкнуть(0);
        щёлкнуть(1);
        // На каждый клик запрос не шлём: ребёнок отмечает шаги подряд.
        expect(отправленное("44")).toHaveLength(0);

        await переждатьТакт();
        expect(отправленное("44")).toHaveLength(1);
        expect(отправленное("44")[0].url).toBe("/api/projects/44/steps");
        expect(отправленное("44")[0].body).toContain('"done":[0,1]');
    });

    test("при открытии верны серверные отметки, а не оставшиеся в браузере", async () => {
        // На этой машине ребёнок отмечал первый шаг, а закончил урок на другой.
        localStorage.setItem("maketka.lesson.7.45", JSON.stringify({ done: [0], collapsed: false }));
        ответСервера = { done: [1], collapsed: false };

        new LessonPanel(card, "45", "7");
        await провернуть();

        expect(отмечено(0)).toBe(false);
        expect(отмечено(1)).toBe(true);
        // Запасная копия в браузере подтягивается к серверной.
        expect(localStorage.getItem("maketka.lesson.7.45")).toContain('"done":[1]');
    });

    test("сервер про работу не знает — накопленное в браузере переезжает наверх", async () => {
        // Старый вид отметок: просто массив номеров шагов.
        localStorage.setItem("maketka.lesson.7.46", JSON.stringify([0]));

        new LessonPanel(card, "46", "7");
        await провернуть();

        expect(отмечено(0)).toBe(true);
        expect(отправленное("46")).toHaveLength(1);
        expect(отправленное("46")[0].body).toContain('"done":[0]');
    });

    test("сервер недоступен — урок идёт на браузерных отметках", async () => {
        localStorage.setItem("maketka.lesson.7.47", JSON.stringify({ done: [1], collapsed: false }));
        globalThis.fetch = (() => Promise.reject(new Error("сети нет"))) as typeof fetch;

        new LessonPanel(card, "47", "7");
        await провернуть();

        expect(отмечено(1)).toBe(true);
        щёлкнуть(0);
        expect(localStorage.getItem("maketka.lesson.7.47")).toContain('"done":[0,1]');
    });

    test("гость сервер не тревожит: аккаунта нет, хранить отметки негде", async () => {
        new LessonPanel(card, "48", "гость");
        await провернуть();
        щёлкнуть(0);
        await переждатьТакт();

        expect(запросы.filter((з) => з.url.includes("/48/"))).toHaveLength(0);
        expect(localStorage.getItem("maketka.lesson.гость.48")).toContain('"done":[0]');
    });
});
