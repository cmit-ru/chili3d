// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: возврат работы из файла `.cd` (B-117). Браузера у нас нет,
// поэтому тест держит договор с оболочкой: содержимое файла уходит на маршрут
// как есть, ребёнок уезжает в мастерскую новой работы, а отказы объясняются его
// словами и никуда не уводят.

import { returnWorkFromFile, returnWorkFromFiles } from "../src/returnWork";

interface Запрос {
    url: string;
    method?: string;
    body: string;
}

/** Файл работы, как его выгружает окно «Что скачать?». */
function файлРаботы(name = "Брелок", version = "0.7.1") {
    return {
        __cla$$__: "Document",
        version,
        id: "doc-1",
        name,
        models: { nodes: [{ __cla$$__: "FolderNode", id: "root-1", name }] },
        acts: [],
        userData: {},
    };
}

const файл = (данные: unknown, имя = "Брелок.cd") =>
    new File([JSON.stringify(данные)], имя, { type: "application/json" });

/** Текст всех показанных сообщений — их место общее с бедами каркаса. */
const сказано = () => document.getElementById("frame-messages")?.textContent ?? "";

describe("Возврат работы из файла", () => {
    const запросы: Запрос[] = [];
    let статус = 200;
    let ответСервера: unknown = { id: 7, title: "Брелок", kind: "3d" };
    let ушли: string[] = [];

    beforeEach(() => {
        запросы.length = 0;
        статус = 200;
        ответСервера = { id: 7, title: "Брелок", kind: "3d" };
        ушли = [];
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            запросы.push({ url: String(url), method: init?.method, body: String(init?.body ?? "") });
            return Promise.resolve({
                ok: статус < 400,
                status: статус,
                json: () => Promise.resolve(ответСервера),
            } as unknown as Response);
        }) as typeof fetch;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("файл уезжает на маршрут как есть, а ребёнок — в мастерскую новой работы", async () => {
        const данные = файлРаботы("Мой брелок");
        const порядок: string[] = [];

        await returnWorkFromFile(файл(данные), {
            flush: async () => {
                порядок.push("досылка");
            },
            go: (href) => {
                порядок.push(href);
                ушли.push(href);
            },
        });

        expect(запросы).toHaveLength(1);
        expect(запросы[0].url).toBe("/projects/from-file");
        expect(запросы[0].method).toBe("POST");
        // Тело — содержимое файла без обёрток: сервер кладёт его телом работы.
        expect(JSON.parse(запросы[0].body)).toEqual(данные);
        expect(ушли).toEqual(["/3d/7"]);
        // Правки открытой работы досылаются ДО ухода, иначе они остались бы здесь.
        expect(порядок).toEqual(["досылка", "/3d/7"]);
    });

    test("не наш файл: слова сервера на экране, со страницы никуда не уводит", async () => {
        статус = 400;
        ответСервера = { message: "Не получилось открыть файл: он не похож на работу из Макетки." };

        await returnWorkFromFile(файл({ parts: [] }), { go: (href) => ушли.push(href) });

        expect(ушли).toEqual([]);
        expect(сказано()).toContain("не похож на работу из Макетки");
    });

    test("гость: сохранять некуда — зовём тот же оверлей, что «Сохранить работу»", async () => {
        статус = 401;
        ответСервера = { error: "not_authenticated" };
        const данные = файлРаботы("Проба гостя");
        const предложено: unknown[] = [];

        await returnWorkFromFile(файл(данные), {
            askGuest: (scene) => предложено.push(scene),
            go: (href) => ушли.push(href),
        });

        // Сцена для оверлея — содержимое файла: после входа она уедет в мастерскую
        // тем же движением, что и собранное в песочнице.
        expect(предложено).toEqual([данные]);
        expect(ушли).toEqual([]);
    });

    test("INV-005: файл прежней версии формата редактор не отбрасывает сам", async () => {
        const старый = файлРаботы("Прошлогодний", "0.6.0");
        delete (старый as { userData?: unknown }).userData;

        await returnWorkFromFile(файл(старый), { go: (href) => ушли.push(href) });

        // Версию решает тот, кто умеет открывать документы, — оболочка и редактор
        // сговариваются об этом на сервере, а не в проверке перед отправкой.
        expect(JSON.parse(запросы[0].body)).toEqual(старый);
        expect(ушли).toEqual(["/3d/7"]);
    });

    test("нет связи: говорим про интернет, файл не теряем", async () => {
        globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;

        await returnWorkFromFile(файл(файлРаботы()), { go: (href) => ушли.push(href) });

        expect(ушли).toEqual([]);
        expect(сказано()).toContain("нет интернета");
    });

    test("несколько файлов разом: возвращается первый, про остальные сказано вслух", async () => {
        const первый = файлРаботы("Первый");
        returnWorkFromFiles([файл(первый, "Первый.cd"), файл(файлРаботы("Второй"), "Второй.cd")], {
            go: (href) => ушли.push(href),
        });
        for (let i = 0; i < 12; i++) await Promise.resolve();

        expect(запросы).toHaveLength(1);
        expect(JSON.parse(запросы[0].body)).toEqual(первый);
        expect(ушли).toEqual(["/3d/7"]);
    });
});
