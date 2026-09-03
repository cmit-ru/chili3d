// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: отзыв из мастерской (B-101). Ценность отзыва — в том, что
// человеку не приходится ничего объяснять: номер работы, версия, браузер и кадр
// экрана уходят сами. Тест держит именно это — состав письма, а не оформление.
// Дверь в отзыв одна и живёт в шапке (`frameBar.ts`), поэтому окно здесь
// открывается вызовом `open()`, а не нажатием на кнопку в углу.

import { Feedback } from "../src/feedback";

interface Отправленное {
    editor: string;
    kind: string;
    message: string;
    projectId: number | null;
    shot: string | null;
    context: { rev: number; карточка: string; версия: string; ошибки: string[] };
}

const запросы: { url: string; body: Отправленное }[] = [];
/** Файлы уходят отдельными запросами сырым телом — здесь их след. */
const файлы: { url: string; name: string; size: number; type: string }[] = [];

/** Снимок готовится обещанием — даём микрозадачам провернуться. */
const провернуть = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

function ответ(status: number, data: unknown) {
    return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve("f77f4174e7820fda036ffd503b06484cab7c52b9\n"),
    } as unknown as Response);
}

describe("Отзыв из мастерской", () => {
    let статус = 200;
    let ответСервера: unknown = { ok: true, id: 7 };

    beforeEach(() => {
        запросы.length = 0;
        файлы.length = 0;
        статус = 200;
        ответСервера = { ok: true, id: 7 };
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            if (String(url).endsWith("/3d/source.txt")) return ответ(200, {});
            if (init?.body instanceof Blob) {
                const headers = (init.headers ?? {}) as Record<string, string>;
                файлы.push({
                    url: String(url),
                    name: headers["X-File-Name"],
                    size: init.body.size,
                    type: headers["Content-Type"],
                });
                return ответ(200, { ok: true, file: { id: 1 } });
            }
            запросы.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
            return ответ(статус, ответСервера);
        }) as typeof fetch;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const открыть = (attach?: () => boolean) => {
        new Feedback({
            projectId: "42",
            context: () => ({ rev: 5, карточка: "Брелок" }),
            shot: async () => "data:image/jpeg;base64,AAAA",
            attach,
        }).open();
    };

    /** Выбор файлов в окне: браузер выставляет `files` сам, тест — руками. */
    const выбрать = (...список: File[]) => {
        const поле = document.querySelector("[data-fb-files]") as HTMLInputElement;
        Object.defineProperty(поле, "files", { value: список, configurable: true });
    };
    const png = (name = "экран.png", size = 16) =>
        new File([new Uint8Array(size)], name, { type: "image/png" });

    test("своей кнопки в углу нет — окно открывает шапка", () => {
        const отзыв = new Feedback({ projectId: "42" });
        expect(document.querySelector("[data-fb-open]")).toBeNull();
        expect(document.querySelector("[data-fb-send]")).toBeNull();

        отзыв.open();
        expect(document.querySelector("[data-fb-send]")).not.toBeNull();
    });

    test("гость без номера работы тоже может написать", () => {
        const отзыв = new Feedback({ projectId: null });
        отзыв.open();
        expect(document.querySelector("[data-fb-send]")).not.toBeNull();
    });

    test("кадр экрана показан заранее — видно, что именно уйдёт", async () => {
        открыть();
        // Пока снимок рисуется, на его месте заглушка, а не пустота.
        expect((document.querySelector("[data-fb-shot-wait]") as HTMLElement).hidden).toBe(false);
        expect((document.querySelector("[data-fb-send]") as HTMLButtonElement).disabled).toBe(false);

        await провернуть();
        const превью = document.querySelector("img") as HTMLImageElement;
        expect(превью.hidden).toBe(false);
        expect(превью.src).toContain("data:image/jpeg");
        expect((document.querySelector("[data-fb-shot-wait]") as HTMLElement).hidden).toBe(true);
    });

    test("отправка в два нажатия: открыть и отправить", async () => {
        открыть();
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();

        expect(запросы).toHaveLength(1);
        const { url, body } = запросы[0];
        expect(url).toBe("/api/feedback");
        expect(body.editor).toBe("3d");
        // Ничего не выбирали и не писали — уходит «Что-то сломалось» без текста.
        expect(body.kind).toBe("broken");
        expect(body.message).toBe("");
        expect(body.projectId).toBe(42);
        expect(body.shot).toBe("data:image/jpeg;base64,AAAA");
        expect(body.context.rev).toBe(5);
        expect(body.context.карточка).toBe("Брелок");
        expect(body.context.версия).toBe("f77f4174e782");
        expect(Array.isArray(body.context.ошибки)).toBe(true);
    });

    test("выбранный вид уходит вместе с отзывом", async () => {
        открыть();
        (document.querySelector('[data-kind="idea"]') as HTMLButtonElement).click();
        (document.querySelector("[data-fb-text]") as HTMLTextAreaElement).value = "пусть будет цвет";
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();

        expect(запросы[0].body.kind).toBe("idea");
        expect(запросы[0].body.message).toBe("пусть будет цвет");
    });

    test("картинку можно не прикладывать", async () => {
        открыть();
        const галка = document.querySelector("[data-fb-shot]") as HTMLInputElement;
        галка.checked = false;
        галка.dispatchEvent(new Event("change"));
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();

        expect(запросы[0].body.shot).toBeNull();
    });

    test("отказ сервера показан словами, отзыв не пропадает", async () => {
        статус = 429;
        ответСервера = { message: "Мы уже получили несколько сообщений — разбираемся." };
        открыть();
        const send = document.querySelector("[data-fb-send]") as HTMLButtonElement;
        send.click();
        await провернуть();

        const note = document.querySelector("[data-fb-error]") as HTMLElement;
        expect(note?.textContent).toContain("уже получили");
        expect(send.disabled).toBe(false);
    });

    test("поля файлов нет ни у гостя, ни у ребёнка — только у взрослого", () => {
        открыть();
        expect(document.querySelector("[data-fb-files]")).toBeNull();
        document.body.innerHTML = "";

        открыть(() => false);
        expect(document.querySelector("[data-fb-files]")).toBeNull();
        document.body.innerHTML = "";

        открыть(() => true);
        const поле = document.querySelector("[data-fb-files]") as HTMLInputElement;
        expect(поле).not.toBeNull();
        expect(поле.multiple).toBe(true);
        expect(поле.accept).toContain(".png");
        expect(поле.accept).not.toContain(".svg");
    });

    test("файлы уходят после текста, по одному, сырым телом с именем в заголовке", async () => {
        открыть(() => true);
        выбрать(png("экран.png"), png("лог.txt", 5));
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();
        await провернуть();

        expect(запросы).toHaveLength(1);
        expect(файлы).toHaveLength(2);
        expect(файлы[0].url).toBe("/api/feedback/7/files");
        expect(файлы[0].type).toBe("application/octet-stream");
        expect(файлы[0].name).toBe("UTF-8''%D1%8D%D0%BA%D1%80%D0%B0%D0%BD.png");
        expect(файлы[0].size).toBe(16);
        expect(файлы[1].name).toBe("UTF-8''%D0%BB%D0%BE%D0%B3.txt");
        expect(document.querySelector("[data-fb-done]")).not.toBeNull();
        expect(document.querySelector("[data-fb-file-failed]")).toBeNull();
    });

    test("файл работы и чужие типы останавливаются до отправки — текст не уходит", async () => {
        открыть(() => true);
        выбрать(png("брелок.cd"));
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();

        expect(запросы).toHaveLength(0);
        expect(файлы).toHaveLength(0);
        const note = document.querySelector("[data-fb-error]") as HTMLElement;
        expect(note?.textContent).toContain("ссылку на неё");

        выбрать(png("a.png"), png("b.png"), png("c.png"), png("d.png"));
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();
        expect(запросы).toHaveLength(0);
        expect((document.querySelector("[data-fb-error]") as HTMLElement).textContent).toContain("трёх");
    });

    test("файл не дошёл — текст всё равно принят, и сказано, где приложить снова", async () => {
        открыть(() => true);
        выбрать(png("экран.png"));
        const обычный = globalThis.fetch;
        globalThis.fetch = ((url: string, init?: RequestInit) =>
            init?.body instanceof Blob
                ? ответ(413, { message: "Файл больше 5 МБ — пришлите картинку поменьше" })
                : обычный(url, init)) as typeof fetch;
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await провернуть();
        await провернуть();

        expect(запросы).toHaveLength(1);
        const card = document.querySelector("[data-fb-done]") as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.hasAttribute("data-fb-file-failed")).toBe(true);
        expect(card.textContent).toContain("больше 5 МБ");
        expect(card.textContent).toContain("Мои обращения");
    });
});
