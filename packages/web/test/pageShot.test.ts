// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: снимок всего окна для отзыва. Тест держит две вещи, на
// которых снимок и стоит: сцена попадает в клон картинкой (сам холст в клоне
// пустой) и при любой осечке уходит прежний кадр рабочей области, а не пустота.

import { НЕ_СНИМАТЬ, подменитьХолсты, снимокОкна } from "../src/pageShot";

const КАДР_СЦЕНЫ = "data:image/jpeg;base64,СЦЕНА";
const КАДР_ОКНА = "data:image/jpeg;base64,ОКНО";

/** Холсты в happy-dom своих кадров не отдают — подкладываем свой. */
function холстСКадром(кадр: string | null): HTMLCanvasElement {
    const холст = document.createElement("canvas");
    холст.setAttribute("style", "width:640px;height:480px");
    холст.toDataURL = () => {
        if (!кадр) throw new Error("испачканный холст");
        return кадр;
    };
    return холст;
}

describe("Снимок окна мастерской", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("холст в клоне заменён картинкой с кадром живой сцены", () => {
        const оригинал = document.createElement("div");
        оригинал.append(холстСКадром(КАДР_СЦЕНЫ));
        document.body.append(оригинал);

        const клон = оригинал.cloneNode(true) as HTMLElement;
        подменитьХолсты(клон, оригинал);

        expect(клон.querySelector("canvas")).toBeNull();
        const картинка = клон.querySelector("img") as HTMLImageElement;
        expect(картинка.getAttribute("src")).toBe(КАДР_СЦЕНЫ);
        // Место на экране задаёт стиль холста, а не разрешение его буфера.
        expect(картинка.getAttribute("style")).toBe("width:640px;height:480px");
    });

    test("испачканный холст не роняет подмену — остаётся пустое место", () => {
        const оригинал = document.createElement("div");
        оригинал.append(холстСКадром(null));
        const клон = оригинал.cloneNode(true) as HTMLElement;

        подменитьХолсты(клон, оригинал);

        const картинка = клон.querySelector("img") as HTMLImageElement;
        expect(картинка).not.toBeNull();
        expect(картинка.getAttribute("src")).toBeNull();
    });

    test("рисование не вышло — уходит прежний кадр рабочей области", async () => {
        // В happy-dom холст кисти не даёт: путь «нарисовать окно» обрывается.
        const снимок = await снимокОкна({ запасной: () => КАДР_СЦЕНЫ });

        expect(снимок.вид).toBe("рабочая область");
        expect(снимок.картинка).toBe(КАДР_СЦЕНЫ);
    });

    test("снимать нечем — отзыв уходит без картинки, но не падает", async () => {
        const снимок = await снимокОкна({
            запасной: () => {
                throw new Error("вида нет");
            },
        });

        expect(снимок.вид).toBe("рабочая область");
        expect(снимок.картинка).toBeNull();
    });

    describe("когда браузер умеет рисовать", () => {
        let разметка = "";
        const прежниеGetContext = HTMLCanvasElement.prototype.getContext;
        const прежнийToDataURL = HTMLCanvasElement.prototype.toDataURL;
        const прежнийImage = globalThis.Image;

        beforeEach(() => {
            разметка = "";
            HTMLCanvasElement.prototype.getContext = (() => ({
                fillStyle: "",
                fillRect: () => undefined,
                drawImage: () => undefined,
            })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.toDataURL = () => КАДР_ОКНА;
            // happy-dom картинки не грузит: свой Image ловит разметку и тут же
            // отвечает «загрузилось».
            globalThis.Image = class {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                set src(значение: string) {
                    разметка = decodeURIComponent(значение.split(",")[1] ?? "");
                    queueMicrotask(() => this.onload?.());
                }
            } as unknown as typeof Image;
        });

        afterEach(() => {
            HTMLCanvasElement.prototype.getContext = прежниеGetContext;
            HTMLCanvasElement.prototype.toDataURL = прежнийToDataURL;
            globalThis.Image = прежнийImage;
        });

        test("на снимок идёт всё окно, а не только сцена", async () => {
            const лента = document.createElement("div");
            лента.textContent = "Скругление";
            document.body.append(лента, холстСКадром(КАДР_СЦЕНЫ));

            const снимок = await снимокОкна({ запасной: () => КАДР_СЦЕНЫ });

            expect(снимок.вид).toBe("экран");
            expect(снимок.картинка).toBe(КАДР_ОКНА);
            // Панель мастерской попала в разметку, сцена — картинкой.
            expect(разметка).toContain("Скругление");
            expect(разметка).toContain(КАДР_СЦЕНЫ);
        });

        test("окно отзыва себя не снимает", async () => {
            const своё = document.createElement("div");
            своё.setAttribute(НЕ_СНИМАТЬ, "");
            своё.textContent = "Что не так?";
            document.body.append(своё);

            await снимокОкна({ запасной: () => КАДР_СЦЕНЫ });

            expect(разметка).not.toContain("Что не так?");
        });

        test("иконки ленты едут спрайтом — иначе на снимке дыры", async () => {
            const окно = window as unknown as Record<string, unknown>;
            окно["_iconfont_svg_string_1"] = '<svg><symbol id="icon-box"></symbol></svg>';
            const кнопка = document.createElement("div");
            кнопка.innerHTML = '<svg><use xlink:href="#icon-box"></use></svg>';
            document.body.append(кнопка);

            await снимокОкна({ запасной: () => КАДР_СЦЕНЫ });
            delete окно["_iconfont_svg_string_1"];

            expect(разметка).toContain('<defs><symbol id="icon-box"></symbol></defs>');
        });
    });
});
