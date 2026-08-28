// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: индикатор сохранения и разбор расхождения.
//
// Правила из ТЗ §5 и acceptance 5:
//   • «Сохранено» появляется только после подтверждения сервера;
//   • при расхождении автосохранение останавливается, но правки продолжают
//     копиться в буфере, а ребёнок видит спокойное состояние, а не модалку;
//   • «Открыть свежую» сначала молча сохраняет копию текущих правок —
//     молчаливой потери нет ни на одной ветке.

// Типы дублируем локально: пакет ui не зависит от storage, чтобы не заводить
// цикл в workspace. Контракт один — состояние сохранения и данные расхождения.
export type SaveState = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";
export interface ConflictInfo {
    serverRev: number;
    changedAt?: string;
}

const TEXT: Record<SaveState, string> = {
    idle: "",
    saving: "Сохраняю…",
    saved: "Сохранено",
    offline: "Интернета нет. Работай дальше — сохраню, когда появится",
    conflict: "Не могу сохранить — работу изменили в другом месте",
    error: "Не могу сохранить — попробую ещё раз",
};

export class SaveIndicator extends HTMLElement {
    private label!: HTMLElement;
    private action!: HTMLButtonElement;
    private state: SaveState = "idle";
    private conflict?: ConflictInfo;

    /** Обработчики задаёт хозяин редактора — здесь только показ состояния. */
    onResolveConflict?: (keepMine: boolean) => Promise<void>;

    constructor() {
        super();
        this.style.cssText = `
            position: fixed; right: 16px; bottom: 16px; z-index: 500;
            display: flex; align-items: center; gap: 10px;
            padding: 9px 13px; border-radius: 4px; font-size: 13px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
            background: var(--panel-background-color, #fff);
            border: 1px solid var(--border-color, #c7d3ce);
            box-shadow: 0 8px 24px -12px rgba(11,31,26,.3);
            transition: opacity .2s ease;
        `;
        this.label = document.createElement("span");
        this.action = document.createElement("button");
        this.action.textContent = "Разобраться";
        this.action.style.cssText = `
            font: inherit; font-weight: 600; padding: 5px 10px; border-radius: 3px;
            border: 1px solid #0e7a5f; background: #0e7a5f; color: #fff; cursor: pointer;
        `;
        this.action.hidden = true;
        this.action.onclick = () => this.showConflictPanel();
        this.append(this.label, this.action);
        this.setState("idle");
    }

    setState(state: SaveState, info?: ConflictInfo) {
        this.state = state;
        this.conflict = info;
        this.label.textContent = TEXT[state];
        this.hidden = state === "idle";
        this.action.hidden = state !== "conflict";
        this.style.borderColor =
            state === "saved"
                ? "#0e7a5f"
                : state === "conflict" || state === "error" || state === "offline"
                  ? "#c98a10"
                  : "";
        this.style.color = state === "conflict" || state === "error" || state === "offline" ? "#c98a10" : "";

        // «Сохранено» не висит вечно: через несколько секунд гаснет, чтобы не
        // мозолить глаза, но состояние ошибки остаётся на экране.
        if (state === "saved") {
            window.setTimeout(() => {
                if (this.state === "saved") this.setState("idle");
            }, 4000);
        }
    }

    /** Диалог показывается ПО ДЕЙСТВИЮ ребёнка, а не сам поверх работы. */
    private showConflictPanel() {
        const when = this.conflict?.changedAt
            ? new Date(this.conflict.changedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "недавно";

        const backdrop = document.createElement("div");
        backdrop.style.cssText = `
            position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
            background: rgba(11,31,26,.45);
        `;
        const card = document.createElement("div");
        card.style.cssText = `
            background: #fff; color: #0b1f1a; border-radius: 8px; padding: 28px;
            max-width: 460px; font-family: system-ui, sans-serif; display: grid; gap: 14px;
        `;
        const title = document.createElement("h2");
        title.textContent = "Эту работу изменили в другом месте";
        title.style.cssText = "margin:0;font-size:20px";

        const text = document.createElement("p");
        text.style.cssText = "margin:0;color:#4a625b;line-height:1.5";
        text.textContent = `Похоже, ты открыл её на другом компьютере — там работа новее (изменена ${when}). Что сделать с тем, что нарисовано здесь?`;

        const keep = document.createElement("button");
        keep.textContent = "Сохранить мой вариант отдельно";
        keep.style.cssText = `
            font: inherit; font-weight: 600; padding: 12px 16px; border-radius: 4px;
            border: none; background: #0e7a5f; color: #fff; cursor: pointer;
        `;
        keep.onclick = async () => {
            keep.disabled = true;
            keep.textContent = "Сохраняю…";
            await this.onResolveConflict?.(true);
            backdrop.remove();
        };

        const open = document.createElement("button");
        open.textContent = "Открыть свежую (мой вариант всё равно сохраню отдельно)";
        open.style.cssText = `
            font: inherit; padding: 10px 16px; border-radius: 4px; cursor: pointer;
            border: 1px solid #c7d3ce; background: none; color: #0b1f1a;
        `;
        open.onclick = async () => {
            open.disabled = true;
            await this.onResolveConflict?.(false);
            backdrop.remove();
        };

        card.append(title, text, keep, open);
        backdrop.appendChild(card);
        backdrop.onclick = (event) => {
            if (event.target === backdrop) backdrop.remove();
        };
        document.body.appendChild(backdrop);
    }
}

customElements.define("chili-save-indicator", SaveIndicator);
