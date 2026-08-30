// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: экран-замок на общем компьютере класса.
//
// Урок кончился, ребёнок ушёл, не нажав «выйти» — следующий садится за чужую
// открытую работу. Замок закрывает экран и честно говорит, чей это компьютер.
// Замок информационный: показывает владельца и даёт выйти (защита — «Выйти»,
// PIN спрашивается при входе, не здесь). Через autoExitMinutes в замке —
// автовыход к «Кто ты?», но только когда всё дослано в облако: автовыход
// не имеет права стоить ребёнку работы (ТЗ §4).

export interface LockOptions {
    /** Через сколько минут бездействия закрывать экран. */
    minutes: number;
    /** Через сколько минут В ЗАМКЕ выходить к «Кто ты?» (0 — не выходить). */
    autoExitMinutes?: number;
    userName: string;
    userAvatar: string;
    /** Есть ли несохранённые правки — тогда честно предупреждаем. */
    hasUnsaved: () => boolean;
    /** Досылка буфера перед блокировкой: работу нельзя терять при уходе. */
    flush: () => Promise<void>;
}

export class ScreenLock {
    private timer?: number;
    private overlay?: HTMLElement;

    constructor(private readonly options: LockOptions) {
        this.arm();
        for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
            window.addEventListener(event, () => this.arm(), { passive: true });
        }
    }

    private arm() {
        if (this.overlay) return; // пока заблокировано — таймер не перезапускаем
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.lock(), this.options.minutes * 60_000);
    }

    private async lock() {
        if (this.overlay) return;

        // Сначала пробуем дослать несохранённое: блокировка не должна стоить
        // ребёнку работы, даже если он уже ушёл из класса.
        await this.options.flush().catch(() => undefined);
        const unsaved = this.options.hasUnsaved();

        // Общий компьютер: постоял в замке — выходим к «Кто ты?», чтобы
        // следующий ребёнок не работал под чужим именем. Перед выходом ещё раз
        // досылаем буфер; если не долетело (нет сети) — остаёмся в замке.
        if (this.options.autoExitMinutes) {
            window.setTimeout(async () => {
                if (!this.overlay) return; // уже разблокировали
                await this.options.flush().catch(() => undefined);
                if (!this.options.hasUnsaved()) {
                    window.location.href = "/logout-form";
                }
            }, this.options.autoExitMinutes * 60_000);
        }

        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 18px; background: rgba(11,31,26,.92); color: #fff;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        `;

        const avatar = document.createElement("div");
        avatar.textContent = this.options.userAvatar || "🙂";
        avatar.style.cssText = "font-size:56px;line-height:1";

        const title = document.createElement("div");
        title.textContent = `Здесь работает ${this.options.userName}`;
        title.style.cssText = "font-size:24px;font-weight:700";

        const hint = document.createElement("div");
        hint.style.cssText = "color:#b7cbc3;max-width:44ch;text-align:center;line-height:1.5";
        hint.textContent = unsaved
            ? "Не всё сохранено — не выключай компьютер, позови преподавателя."
            : "Работа сохранена. Если это твой компьютер — продолжай.";

        const buttons = document.createElement("div");
        buttons.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;justify-content:center";

        const resume = document.createElement("button");
        resume.textContent = "Это я, продолжить";
        resume.style.cssText = `
            font: inherit; font-weight: 600; padding: 13px 22px; border-radius: 4px;
            border: none; background: #35c79a; color: #04120e; cursor: pointer;
        `;
        resume.onclick = () => this.unlock();

        const leave = document.createElement("a");
        leave.textContent = "Выйти";
        leave.href = "#";
        leave.style.cssText = `
            font: inherit; padding: 13px 22px; border-radius: 4px; text-decoration: none;
            border: 1px solid rgba(255,255,255,.35); color: #fff;
        `;
        leave.onclick = (event) => {
            event.preventDefault();
            window.location.href = "/logout-form";
        };

        buttons.append(resume, leave);
        overlay.append(avatar, title, hint, buttons);
        document.body.appendChild(overlay);
        this.overlay = overlay;
        resume.focus();
    }

    private unlock() {
        this.overlay?.remove();
        this.overlay = undefined;
        this.arm();
    }
}
