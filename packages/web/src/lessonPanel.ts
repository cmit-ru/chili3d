// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: шаги урока рядом с работой.
//
// Ребёнок не должен переключаться между вкладкой с заданием и мастерской:
// на уроке это гарантированные «а что дальше?» и очередь к преподавателю.
// Отметки о выполненных шагах — подсказка себе, а не оценка, но хранятся они
// у аккаунта (B-118): занятия идут на общих компьютерах класса, и в браузере
// галочки доставались следующему ученику, а при пересадке за другую машину
// пропадали. В браузере остаётся копия — запасной путь на случай обрыва сети.

import { type IDocument, type INode, PubSub } from "@chili3d/core";
import { FRAME_FONT } from "./errorBanner";

export interface LessonCard {
    slug: string;
    title: string;
    steps: string[];
    minutes: number;
}

/** Отметки, как их знают и панель, и сервер. */
interface Отметки {
    done: number[];
    collapsed?: boolean;
}

/** На сервер уходит не каждый клик: шаги отмечают подряд. Такт тот же, что у
 *  настроек рабочего места в мастерской схем. */
const ЗАДЕРЖКА_МС = 800;

/** Так каркас называет пришедшего без входа: у гостя аккаунта нет, и хранить
 *  его отметки серверу негде — они остаются только в браузере. */
const ГОСТЬ = "гость";

export class LessonPanel {
    private root: HTMLElement;
    private list!: HTMLOListElement;
    private collapsed = false;
    private done: number[] = [];
    /** Свернуть/развернуть список: нужно и после ответа сервера, не только по клику. */
    private fold: () => void = () => {};
    /** Ребёнок успел щёлкнуть до ответа сервера — его отметки свежее ответа. */
    private тронуто = false;
    private таймер?: number;

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
        // Показываем сразу по браузерной копии: ждать ответа сервера, чтобы
        // увидеть задание, ребёнок не должен.
        const местные = this.местные();
        this.принять(местные);
        this.render();
        void this.подтянуть(местные);

        if (this.userId !== ГОСТЬ) {
            // Вкладку закрывают, не дождавшись такта: обычный запрос уже не успеет.
            window.addEventListener("pagehide", () => this.досдать());
        }
    }

    /**
     * Ключ привязан к ученику: на общем компьютере класса следующий ребёнок не
     * должен видеть чужие галочки.
     */
    private storageKey() {
        return `maketka.lesson.${this.userId}.${this.projectId}`;
    }

    private адрес() {
        return `/api/projects/${this.projectId}/steps`;
    }

    private тело() {
        return JSON.stringify({ done: this.done, collapsed: this.collapsed });
    }

    /** Отметки из браузера: запасной путь и наследство до B-118. */
    private местные(): Отметки {
        try {
            const raw = JSON.parse(localStorage.getItem(this.storageKey()) ?? "[]");
            // Старый вид отметок — просто массив номеров шагов.
            if (Array.isArray(raw)) return { done: raw };
            return { done: Array.isArray(raw.done) ? raw.done : [], collapsed: raw.collapsed };
        } catch {
            return { done: [] };
        }
    }

    /** По умолчанию панель развёрнута, но свёрнута, когда все шаги отмечены. */
    private принять(отметки: Отметки) {
        this.done = отметки.done;
        this.collapsed = отметки.collapsed ?? отметки.done.length >= this.card.steps.length;
    }

    private запомнить() {
        try {
            localStorage.setItem(this.storageKey(), this.тело());
        } catch {
            // Приватный режим: отметки просто не сохранятся, урок не ломается.
        }
    }

    /** Сервер знает, что ребёнок отмечал на другой машине, — это и есть истина. */
    private async подтянуть(местные: Отметки) {
        if (this.userId === ГОСТЬ) return;
        let ответ: Отметки | undefined;
        try {
            const response = await fetch(this.адрес(), { credentials: "same-origin" });
            // 401 без входа, 5xx — остаёмся на браузерных отметках.
            if (!response.ok) return;
            ответ = (await response.json()) as Отметки;
        } catch {
            return; // сети нет — урок идёт на браузерных отметках
        }
        if (Array.isArray(ответ?.done)) {
            if (this.тронуто) return; // ребёнок уже щёлкал — его отметки новее
            this.принять({ done: ответ.done, collapsed: ответ.collapsed });
            this.renderSteps();
            this.fold();
            this.запомнить(); // копия в браузере = то, что на сервере
            return;
        }
        // Сервер про эту работу не знает ничего: то, что ребёнок наотмечал в
        // браузере раньше, переносим наверх, а не теряем.
        if (местные.done.length || местные.collapsed !== undefined) this.отправить();
    }

    private сохранить() {
        this.тронуто = true;
        this.запомнить();
        if (this.userId === ГОСТЬ) return; // хранить негде — аккаунта нет
        window.clearTimeout(this.таймер);
        this.таймер = window.setTimeout(() => this.отправить(), ЗАДЕРЖКА_МС);
    }

    private отправить() {
        window.clearTimeout(this.таймер);
        this.таймер = undefined;
        void fetch(this.адрес(), {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: this.тело(),
        }).catch(() => undefined); // не ушло — отметки остались в браузере
    }

    /** Последняя попытка при уходе со страницы: такт ждать уже некогда. */
    private досдать() {
        if (this.таймер === undefined) return;
        window.clearTimeout(this.таймер);
        this.таймер = undefined;
        try {
            navigator.sendBeacon?.(this.адрес(), new Blob([this.тело()], { type: "application/json" }));
        } catch {
            // Не ушло — отметки остались в браузере, оттуда и поднимутся.
        }
    }

    private toggleStep(index: number) {
        const done = new Set(this.done);
        done.has(index) ? done.delete(index) : done.add(index);
        // По порядку шагов: так же их вернёт сервер, и браузерная копия с ним сходится.
        this.done = [...done].sort((a, b) => a - b);
        this.сохранить();
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
        this.fold = () => {
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
            this.fold();
            this.сохранить();
        };

        this.list = document.createElement("ol");
        this.list.style.cssText = `
            margin: 0; padding: 10px 14px 14px 14px; list-style: none;
            display: grid; gap: 8px;
        `;

        this.root.append(header, this.list);
        this.renderSteps();
        this.fold();

        const sidebar = document.getElementById("editor-sidebar");
        if (sidebar) sidebar.insertBefore(this.root, sidebar.firstChild);
        else document.body.appendChild(this.root);

        // Ребёнок выделил фигуру — ему нужны поля размеров. Если шаги в отведённую
        // им долю колонки не влезли, панель уступает место, а не спорит за него.
        PubSub.default.sub("showProperties", (_doc: IDocument, nodes: INode[]) => {
            if (nodes.length === 0 || this.collapsed) return;
            if (this.root.scrollHeight > this.root.clientHeight + 1) {
                this.collapsed = true;
                this.fold();
            }
        });
    }

    private renderSteps() {
        const done = new Set(this.done);
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
