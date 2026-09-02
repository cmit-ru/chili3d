// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: шаги урока рядом с работой.
//
// Ребёнок не должен переключаться между вкладкой с заданием и мастерской:
// на уроке это гарантированные «а что дальше?» и очередь к преподавателю.
// Отметки о выполненных шагах живут в браузере — это подсказка себе, а не
// оценка, поэтому на сервер они не уходят.

import { type IDocument, type INode, PubSub } from "@chili3d/core";
import { FRAME_FONT } from "./errorBanner";

export interface LessonCard {
    slug: string;
    title: string;
    steps: string[];
    minutes: number;
}

export class LessonPanel {
    private root: HTMLElement;
    private list!: HTMLOListElement;
    private collapsed = false;

    constructor(
        private readonly card: LessonCard,
        private readonly projectId: string,
        private readonly userId: string,
    ) {
        this.root = document.createElement("aside");
        // Панель — первый блок левой колонки, а не накладка: накладка 320×345
        // закрывала поля размеров выделенной фигуры и низ статусной строки.
        //
        // Колонка — flex-столбец, где дерево проекта и свойства делят высоту
        // поровну. Панель с `height: auto` при карточке на восемь шагов съела бы
        // колонку целиком, и поля размеров схлопнулись бы в ноль — ровно та
        // потеря, ради устранения которой панель и переехала. Отсюда жёсткий
        // потолок: апстримный CSS при этом не трогаем.
        this.root.style.cssText = `
            flex: 0 0 auto; max-height: 40%; overflow-y: auto;
            background: var(--panel-background-color, #fff);
            color: var(--foreground-color, #0b1f1a);
            border-bottom: 1px solid var(--border-color, #c7d3ce);
            font-family: ${FRAME_FONT};
            font-size: 14px;
        `;
        this.render();
    }

    /**
     * Ключ привязан к ученику: на общем компьютере класса следующий ребёнок не
     * должен видеть чужие галочки.
     */
    private storageKey() {
        return `maketka.lesson.${this.userId}.${this.projectId}`;
    }

    private state(): { done: number[]; collapsed?: boolean } {
        try {
            const raw = JSON.parse(localStorage.getItem(this.storageKey()) ?? "[]");
            // Старый вид отметок — просто массив номеров шагов.
            if (Array.isArray(raw)) return { done: raw };
            return { done: Array.isArray(raw.done) ? raw.done : [], collapsed: raw.collapsed };
        } catch {
            return { done: [] };
        }
    }

    private doneSteps(): number[] {
        return this.state().done;
    }

    private save(done: number[], collapsed: boolean) {
        try {
            localStorage.setItem(this.storageKey(), JSON.stringify({ done, collapsed }));
        } catch {
            // Приватный режим: отметки просто не сохранятся, урок не ломается.
        }
    }

    private toggleStep(index: number) {
        const done = new Set(this.doneSteps());
        done.has(index) ? done.delete(index) : done.add(index);
        this.save([...done], this.collapsed);
        this.renderSteps();
    }

    private render() {
        const header = document.createElement("button");
        header.type = "button";
        header.style.cssText = `
            display: flex; align-items: center; gap: 10px; width: 100%;
            padding: 12px 14px; border: 0; background: none; cursor: pointer;
            font: inherit; font-weight: 600; text-align: left; color: inherit;
            border-bottom: 1px solid var(--border-color, #e3ebe8);
        `;
        const caret = document.createElement("span");
        caret.textContent = "▾";
        caret.style.cssText = "color:#0e7a5f;transition:transform .15s ease";
        const title = document.createElement("span");
        // «Задание: …» — одно слово на обе мастерские: панель стоит в разных
        // местах, и без него фраза «посмотрите задание» верна лишь для половины
        // класса.
        title.textContent = `Задание: ${this.card.title}`;
        title.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const minutes = document.createElement("span");
        minutes.textContent = `${this.card.minutes} мин`;
        minutes.style.cssText = "font-size:12.5px;color:#4a625b";

        header.append(caret, title, minutes);
        header.setAttribute("aria-expanded", "true");
        const fold = () => {
            this.list.hidden = this.collapsed;
            header.setAttribute("aria-expanded", String(!this.collapsed));
            // Одного `hidden` мало: у списка инлайновый `display: grid`, а он сильнее
            // правила браузера `[hidden] { display: none }` — панель не сворачивалась.
            // Гасим тем же способом, каким показываем.
            this.list.style.display = this.collapsed ? "none" : "grid";
            caret.style.transform = this.collapsed ? "rotate(-90deg)" : "";
        };
        header.onclick = () => {
            this.collapsed = !this.collapsed;
            fold();
            this.save(this.doneSteps(), this.collapsed);
        };

        this.list = document.createElement("ol");
        this.list.style.cssText = `
            margin: 0; padding: 10px 14px 14px 14px; list-style: none;
            display: grid; gap: 8px;
        `;

        this.root.append(header, this.list);
        this.renderSteps();

        // По умолчанию: развёрнута при первом открытии работы, свёрнута, когда
        // все шаги отмечены.
        const state = this.state();
        this.collapsed = state.collapsed ?? state.done.length >= this.card.steps.length;
        fold();

        const sidebar = document.getElementById("editor-sidebar");
        if (sidebar) sidebar.insertBefore(this.root, sidebar.firstChild);
        else document.body.appendChild(this.root);

        // Ребёнок выделил фигуру — ему нужны поля размеров. Если шаги в отведённую
        // им долю колонки не влезли, панель уступает место, а не спорит за него.
        PubSub.default.sub("showProperties", (_doc: IDocument, nodes: INode[]) => {
            if (nodes.length === 0 || this.collapsed) return;
            if (this.root.scrollHeight > this.root.clientHeight + 1) {
                this.collapsed = true;
                fold();
            }
        });
    }

    private renderSteps() {
        const done = new Set(this.doneSteps());
        this.list.innerHTML = "";

        this.card.steps.forEach((step, index) => {
            const item = document.createElement("li");
            item.style.cssText = "display:flex;gap:10px;align-items:flex-start;line-height:1.45";

            const check = document.createElement("input");
            check.type = "checkbox";
            check.checked = done.has(index);
            check.style.cssText =
                "margin-top:3px;min-width:16px;min-height:16px;accent-color:#0e7a5f;cursor:pointer";
            check.onchange = () => this.toggleStep(index);
            check.id = `step-${index}`;

            const label = document.createElement("label");
            label.htmlFor = check.id;
            label.textContent = step;
            label.style.cssText = `cursor:pointer;${done.has(index) ? "color:#8aa39b;text-decoration:line-through" : ""}`;

            item.append(check, label);
            this.list.appendChild(item);
        });

        const left = this.card.steps.length - done.size;
        const footer = document.createElement("li");
        footer.style.cssText = "color:#4a625b;font-size:12.5px;padding-top:4px";
        footer.textContent =
            left === 0 ? "Все шаги сделаны — покажи работу преподавателю" : `Осталось шагов: ${left}`;
        this.list.appendChild(footer);
    }
}
