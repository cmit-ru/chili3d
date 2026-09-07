// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: замок правки — наставник правит работу, ученик её не правит.
//
// Две половины одного механизма (B-257, B-262):
//   • у наставника — пульс: пока он в режиме правки, вкладка раз в 45 секунд
//     подтверждает замок (`EditLockHolder`). Вышел из правки или ушёл со страницы —
//     замок снимается сразу; забыл вкладку — сервер отпустит работу сам через две
//     минуты тишины (аренда, `src/editLock.js` оболочки);
//   • у ученика — опрос: раз в 12 секунд И ТОЛЬКО ПРИ ВИДИМОЙ ВКЛАДКЕ
//     (`EditLockWatch`). Свёрнутая вкладка не жжёт ни батарею, ни базу; вернулась
//     на экран — спрашиваем сразу, не дожидаясь такта. Живого канала (WebSocket,
//     EventSource) в проекте нет, и заводить его ради двух слов не стоит: образец
//     опроса — `AiOps.poll()`.
//
// Пока замок держится, ученику поднимается щит: левые нажатия до сцены и ленты
// команд не доходят, а камера (правая и средняя кнопки, колесо) работает —
// смотреть, что делает наставник, ребёнку никто не запрещает. Тот же приём, что
// у исполнителя пакетов помощника (`aiOps.ts`).
//
// Слова и сроки — общие с мастерской схем (`web/circuits/mentorLock.js` оболочки
// и `agent_docs/frame-contract.md`, разделы «Слова режимов» и «Замок правки»).
// Правишь здесь — правь и там, одним заходом.

import { FRAME_FONT } from "./errorBanner";
import { placeAsMode } from "./frameBar";

/** Как часто вкладка наставника подтверждает, что он ещё правит. Аренда — 2 минуты. */
const ПУЛЬС_МС = 45_000;

/** Как часто ученик спрашивает про замок. */
const ОПРОС_МС = 12_000;

/** Слова замка — дословно те же, что в мастерской схем. */
export const СЛОВА = {
    занято: "Твою работу сейчас правит наставник — подожди немного",
    свободно: "Наставник закончил — можно работать дальше",
};

const адрес = (projectId: string, что: string) => `/api/projects/${projectId}/${что}`;

/** Наставник вошёл в правку: держим замок, пока вкладка жива. */
export class EditLockHolder {
    private timer: number | undefined;

    constructor(private readonly projectId: string) {}

    /** Взять замок и подтверждать его пульсом. Повторный вызов ничего не ломает. */
    hold() {
        if (this.timer !== undefined) return;
        this.beat();
        this.timer = window.setInterval(() => this.beat(), ПУЛЬС_МС);
        // Вкладку закрывают — обычный запрос уже не успевает уйти, а держать чужую
        // работу запертой лишние две минуты незачем: ребёнок ждёт.
        window.addEventListener("pagehide", this.onPageHide);
    }

    /** Наставник вышел из правки: работа свободна сразу, а не через аренду. */
    async release() {
        if (this.timer === undefined) return;
        window.clearInterval(this.timer);
        this.timer = undefined;
        window.removeEventListener("pagehide", this.onPageHide);
        await fetch(адрес(this.projectId, "edit-unlock"), {
            method: "POST",
            credentials: "same-origin",
        }).catch(() => undefined);
    }

    private beat() {
        void fetch(адрес(this.projectId, "edit-lock"), {
            method: "POST",
            credentials: "same-origin",
        }).catch(() => undefined);
    }

    private readonly onPageHide = () => {
        window.clearInterval(this.timer);
        this.timer = undefined;
        try {
            navigator.sendBeacon?.(адрес(this.projectId, "edit-unlock"), new Blob([]));
        } catch {
            // Не ушло — сервер отпустит работу сам через две минуты тишины.
        }
    };
}

/** Ученик открыл свою работу: следим, не сел ли за неё наставник. */
export class EditLockWatch {
    private timer: number | undefined;
    private busy = false;
    private locked: boolean;

    constructor(
        private readonly projectId: string,
        locked: boolean,
        /** Вызывается только при СМЕНЕ состояния — иначе слова повторялись бы каждый такт. */
        private readonly onChange: (locked: boolean) => void,
    ) {
        this.locked = locked;
        document.addEventListener("visibilitychange", this.onVisibility);
        this.start();
    }

    /** Прекратить опрос совсем. Нужен разбору вкладки и тестам. */
    stop() {
        this.stopTimer();
        document.removeEventListener("visibilitychange", this.onVisibility);
    }

    private readonly onVisibility = () => {
        // Вкладка вернулась на экран — спрашиваем сразу: ребёнок уже смотрит на
        // работу и не должен ждать такт, чтобы узнать, можно ли её трогать.
        if (this.visible()) {
            void this.ask();
            this.start();
        } else {
            this.stopTimer();
        }
    };

    private visible() {
        return document.visibilityState !== "hidden";
    }

    private start() {
        this.stopTimer();
        if (!this.visible()) return;
        this.timer = window.setInterval(() => void this.ask(), ОПРОС_МС);
    }

    private stopTimer() {
        window.clearInterval(this.timer);
        this.timer = undefined;
    }

    private async ask() {
        if (this.busy || !this.visible()) return;
        this.busy = true;
        try {
            const response = await fetch(адрес(this.projectId, "edit-state"), {
                credentials: "same-origin",
            });
            if (!response.ok) return;
            const data = (await response.json()) as { mentorEditing?: boolean };
            const now = Boolean(data.mentorEditing);
            if (now !== this.locked) {
                this.locked = now;
                this.onChange(now);
            }
        } catch {
            // Сеть моргнула — спросим на следующем такте.
        } finally {
            this.busy = false;
        }
    }
}

/**
 * Щит на время чужой правки: левые нажатия до сцены и ленты команд не доходят,
 * а полоса мастерской работает — уйти и позвать взрослого ребёнок должен уметь
 * всегда. Камера и колесо не трогаются: смотреть можно.
 */
export class EditLockShield {
    private readonly banner: HTMLElement;
    private up = false;

    constructor() {
        this.banner = document.createElement("div");
        // Опора для браузерной спеки паритета: одинаковая в обеих мастерских
        // (`frame-contract.md`, раздел «Замок правки»).
        this.banner.dataset["mentorLock"] = "";
        this.banner.style.cssText = `
            display: none; align-items: center; gap: 12px; flex-wrap: wrap;
            padding: 8px 12px; border-radius: 8px;
            background: #fdf6e3; border: 1px solid #c98a10; color: #7a5408;
            font-family: ${FRAME_FONT};
            font-size: 13.5px; max-width: min(680px, calc(100vw - 24px));
        `;
        placeAsMode(this.banner);
        this.banner.textContent = СЛОВА.занято;
        document.body.appendChild(this.banner);
    }

    raise() {
        if (this.up) return;
        this.up = true;
        this.banner.style.display = "flex";
        window.addEventListener("pointerdown", this.block, true);
        window.addEventListener("click", this.block, true);
        window.addEventListener("keydown", this.block, true);
    }

    lower() {
        if (!this.up) return;
        this.up = false;
        this.banner.style.display = "none";
        window.removeEventListener("pointerdown", this.block, true);
        window.removeEventListener("click", this.block, true);
        window.removeEventListener("keydown", this.block, true);
    }

    private readonly block = (event: Event) => {
        const mouse = event as MouseEvent;
        // Камера и колесо — не правка: вращать сцену можно и под замком.
        if (event.type !== "keydown" && mouse.button > 0) return;
        const target = event.target as Element | null;
        if (target?.closest?.("[data-frame-bar], [data-mentor-lock]")) return;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
    };
}
