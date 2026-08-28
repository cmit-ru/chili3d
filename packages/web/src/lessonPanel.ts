// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: шаги урока рядом с работой.
//
// Ребёнок не должен переключаться между вкладкой с заданием и мастерской:
// на уроке это гарантированные «а что дальше?» и очередь к преподавателю.
// Отметки о выполненных шагах живут в браузере — это подсказка себе, а не
// оценка, поэтому на сервер они не уходят.

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
    ) {
        this.root = document.createElement("aside");
        this.root.style.cssText = `
            position: fixed; left: 16px; bottom: 16px; z-index: 400;
            width: min(320px, calc(100vw - 32px));
            background: var(--panel-background-color, #fff);
            color: var(--foreground-color, #0b1f1a);
            border: 1px solid var(--border-color, #c7d3ce);
            border-radius: 8px; box-shadow: 0 10px 30px -14px rgba(11,31,26,.4);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 14px; overflow: hidden;
        `;
        this.render();
    }

    private storageKey() {
        return `maketka.lesson.${this.projectId}`;
    }

    private doneSteps(): number[] {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey()) ?? "[]");
        } catch {
            return [];
        }
    }

    private toggleStep(index: number) {
        const done = new Set(this.doneSteps());
        done.has(index) ? done.delete(index) : done.add(index);
        try {
            localStorage.setItem(this.storageKey(), JSON.stringify([...done]));
        } catch {
            // Приватный режим: отметки просто не сохранятся, урок не ломается.
        }
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
        title.textContent = this.card.title;
        title.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const minutes = document.createElement("span");
        minutes.textContent = `${this.card.minutes} мин`;
        minutes.style.cssText = "font-size:12px;color:#4a625b;font-family:ui-monospace,Menlo,monospace";

        header.append(caret, title, minutes);
        header.onclick = () => {
            this.collapsed = !this.collapsed;
            this.list.hidden = this.collapsed;
            caret.style.transform = this.collapsed ? "rotate(-90deg)" : "";
        };

        this.list = document.createElement("ol");
        this.list.style.cssText = `
            margin: 0; padding: 10px 14px 14px 14px; list-style: none;
            display: grid; gap: 8px; max-height: 45vh; overflow-y: auto;
        `;

        this.root.append(header, this.list);
        this.renderSteps();
        document.body.appendChild(this.root);
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
            check.style.cssText = "margin-top:3px;accent-color:#0e7a5f;cursor:pointer";
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
