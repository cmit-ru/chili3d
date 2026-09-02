// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: подсказка при первом входе в мастерскую (ТЗ §7).
//
// Ребёнок открывает редактор впервые и видит полсотни незнакомых кнопок. Три
// коротких шага снимают главный вопрос — «куда нажимать»; подсказка закрывается
// в один клик и больше не приходит: отметка хранится у аккаунта, поэтому на
// другом компьютере класса она не покажется заново.

import { FRAME_FONT } from "./errorBanner";

const STEPS = [
    {
        title: "Выбери фигуру наверху",
        // Слова «лента» здесь нет намеренно: ребёнок десяти лет знает ленту
        // новостей, а не ленту Microsoft Office.
        text: "Кубик, шар или линия — всё это наверху. Нажми на нужную и рисуй.",
    },
    {
        title: "Щёлкай по сцене",
        text: "Первый щелчок — начало фигуры, следующие задают размер. Промахнулся — нажми Esc.",
    },
    {
        title: "Работа сохраняется сама",
        text:
            "Наверху, рядом с именем работы, видно, сохранилась ли она. " + "Можно спокойно закрыть вкладку.",
    },
];

export class FirstHint {
    private index = 0;
    private readonly root: HTMLElement;
    private readonly title: HTMLElement;
    private readonly text: HTMLElement;
    private readonly counter: HTMLElement;
    private readonly next: HTMLButtonElement;

    constructor(private readonly onDone: () => void) {
        this.root = document.createElement("div");
        // Левый нижний угол, а не низ по центру: там у ядра `.actsContainer`
        // со слоем 99999, а в правом нижнем стоят постоянные мелочи.
        this.root.dataset["framePlace"] = "bottom-left";
        this.root.dataset["frameGroup"] = "first-hint";
        this.root.style.cssText = `
            position: fixed; left: 16px; bottom: 16px; z-index: 500;
            width: min(340px, calc(100vw - 32px));
            background: var(--panel-background-color, #fff);
            color: var(--foreground-color, #0b1f1a);
            border: 1px solid var(--border-color, #c7d3ce); border-radius: 8px;
            box-shadow: 0 14px 34px -18px rgba(11,31,26,.5);
            font-family: ${FRAME_FONT};
            padding: 18px; display: grid; gap: 8px;
        `;

        this.title = document.createElement("div");
        this.title.style.cssText = "font-size:16px;font-weight:700";

        this.text = document.createElement("div");
        this.text.style.cssText = "font-size:14px;line-height:1.5;color:#3d534c";

        this.counter = document.createElement("span");
        this.counter.style.cssText = "font-size:12.5px;color:#4a625b";

        this.next = document.createElement("button");
        this.next.type = "button";
        this.next.style.cssText = `
            font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 6px;
            min-height: 24px; border: none; background: #0e7a5f; color: #fff; cursor: pointer;
        `;
        this.next.onclick = () => this.advance();

        const skip = document.createElement("button");
        skip.type = "button";
        skip.textContent = "Пропустить";
        skip.style.cssText = `
            font: inherit; font-size: 14px; padding: 9px 12px; border-radius: 6px;
            min-height: 24px; border: 1px solid var(--border-color, #c7d3ce); background: none;
            color: #4a625b; cursor: pointer;
        `;
        skip.onclick = () => this.finish();

        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:4px";
        row.append(this.counter, document.createElement("span"), skip, this.next);
        (row.children[1] as HTMLElement).style.flex = "1";

        this.root.append(this.title, this.text, row);
        document.body.appendChild(this.root);
        this.render();
    }

    private render() {
        const step = STEPS[this.index];
        this.title.textContent = step.title;
        this.text.textContent = step.text;
        this.counter.textContent = `${this.index + 1} из ${STEPS.length}`;
        this.next.textContent = this.index === STEPS.length - 1 ? "Понятно" : "Дальше";
    }

    private advance() {
        if (this.index === STEPS.length - 1) {
            this.finish();
            return;
        }
        this.index += 1;
        this.render();
    }

    private finish() {
        this.root.remove();
        this.onDone();
    }
}
