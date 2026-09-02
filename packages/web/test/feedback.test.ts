// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: отзыв из мастерской (B-101). Ценность кнопки — в том, что
// человеку не приходится ничего объяснять: номер работы, версия, браузер и кадр
// экрана уходят сами. Тест держит именно это — состав письма, а не оформление.

import { Feedback } from "../src/feedback";

interface Отправленное {
    editor: string;
    kind: string;
    message: string;
    projectId: number | null;
    shot: string | null;
    context: { rev: number; роль: string; версия: string; ошибки: string[] };
}

const запросы: { url: string; body: Отправленное }[] = [];

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
        статус = 200;
        ответСервера = { ok: true, id: 7 };
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            if (String(url).endsWith("/3d/source.txt")) return ответ(200, {});
            запросы.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
            return ответ(статус, ответСервера);
        }) as typeof fetch;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const открыть = () => {
        new Feedback({
            projectId: "42",
            context: () => ({ rev: 5, роль: "student", карточка: "Брелок" }),
            shot: () => "data:image/jpeg;base64,AAAA",
        });
        (document.querySelector("[data-fb-open]") as HTMLButtonElement).click();
    };

    test("кнопка стоит в углу мастерской и открывает окно", () => {
        new Feedback({ projectId: "42" });
        const button = document.querySelector("[data-fb-open]") as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.textContent).toBe("Что-то не так?");
        expect(document.querySelector("[data-fb-send]")).toBeNull();

        button.click();
        expect(document.querySelector("[data-fb-send]")).not.toBeNull();
    });

    test("кадр экрана показан заранее — видно, что именно уйдёт", () => {
        открыть();
        const превью = document.querySelector("img") as HTMLImageElement;
        expect(превью.hidden).toBe(false);
        expect(превью.src).toContain("data:image/jpeg");
    });

    test("отправка в два нажатия: открыть и отправить", async () => {
        открыть();
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

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
        expect(body.context.роль).toBe("student");
        expect(body.context.версия).toBe("f77f4174e782");
        expect(Array.isArray(body.context.ошибки)).toBe(true);
    });

    test("выбранный вид уходит вместе с отзывом", async () => {
        открыть();
        (document.querySelector('[data-kind="idea"]') as HTMLButtonElement).click();
        (document.querySelector("[data-fb-text]") as HTMLTextAreaElement).value = "пусть будет цвет";
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(запросы[0].body.kind).toBe("idea");
        expect(запросы[0].body.message).toBe("пусть будет цвет");
    });

    test("картинку можно не прикладывать", async () => {
        открыть();
        const галка = document.querySelector("[data-fb-shot]") as HTMLInputElement;
        галка.checked = false;
        галка.dispatchEvent(new Event("change"));
        (document.querySelector("[data-fb-send]") as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(запросы[0].body.shot).toBeNull();
    });

    test("отказ сервера показан словами, отзыв не пропадает", async () => {
        статус = 429;
        ответСервера = { message: "Мы уже получили несколько сообщений — разбираемся." };
        открыть();
        const send = document.querySelector("[data-fb-send]") as HTMLButtonElement;
        send.click();
        for (let i = 0; i < 6; i++) await Promise.resolve();

        const note = document.querySelector("[data-fb-error]") as HTMLElement;
        expect(note?.textContent).toContain("уже получили");
        expect(send.disabled).toBe(false);
    });
});
