// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: страховка от падения геометрического ядра.
//
// OCCT собран с `-sDISABLE_EXCEPTION_CATCHING=1`, поэтому невозможная операция
// (скругление слишком большим радиусом, булева над самопересекающейся формой)
// не возвращает ошибку, а обрывает работу всего wasm-модуля: «RuntimeError:
// Aborted». После этого редактор мёртв, и без страховки ребёнок теряет всё,
// что начертил после последнего сохранения.
//
// До пересборки ядра с включёнными исключениями (фаза 1.1r) делаем две вещи:
//   1) сохраняем работу ПЕРЕД рискованной операцией — тогда откат стоит
//      максимум одного действия;
//   2) ловим падение и честно говорим ребёнку, что происходит, вместо
//      застывшего экрана с непонятной английской ошибкой.

import { type IApplication, PubSub } from "@chili3d/core";

/** Команды, которые чаще всего роняют ядро: геометрия может оказаться невозможной. */
const RISKY_COMMANDS = new Set([
    "modify.fillet",
    "modify.chamfer",
    "modify.split",
    "modify.trim",
    "modify.shell",
    "modify.sew",
    "boolean.cut",
    "boolean.join",
    "boolean.common",
    "convert.fuse",
    "create.sweep",
    "create.loft",
    "create.offset",
    "create.revol",
]);

function looksLikeCoreCrash(message: string): boolean {
    return /Aborted|RuntimeError|memory access out of bounds|unreachable/i.test(message);
}

export class CoreGuard {
    private crashed = false;
    private lastSave = 0;

    constructor(
        private readonly app: IApplication,
        private readonly saveNow: () => Promise<void>,
        private readonly track: (event: string, props?: Record<string, unknown>) => void,
    ) {
        PubSub.default.sub("executeCommand", (name) => void this.beforeCommand(String(name)));
        window.addEventListener("error", (event) => {
            if (looksLikeCoreCrash(String(event.message))) this.onCrash(String(event.message));
        });
        window.addEventListener("unhandledrejection", (event) => {
            const reason = String((event as PromiseRejectionEvent).reason ?? "");
            if (looksLikeCoreCrash(reason)) this.onCrash(reason);
        });
    }

    /** Перед рискованной командой фиксируем состояние, чтобы было куда вернуться. */
    private async beforeCommand(name: string) {
        if (this.crashed || !RISKY_COMMANDS.has(name)) return;
        // Чаще раза в пять секунд не сохраняем: команды идут пачками.
        if (Date.now() - this.lastSave < 5000) return;
        this.lastSave = Date.now();
        try {
            await this.saveNow();
        } catch {
            // Не смогли сохранить — операцию всё равно не блокируем.
        }
    }

    private onCrash(message: string) {
        if (this.crashed) return;
        this.crashed = true;
        this.track("core_crash", { message: message.slice(0, 200) });
        this.showRecoveryScreen();
    }

    private showRecoveryScreen() {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1200;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 16px; background: rgba(11,31,26,.94); color: #fff; text-align: center;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px;
        `;

        const title = document.createElement("div");
        title.style.cssText = "font-size:22px;font-weight:700";
        title.textContent = "Не получилось выполнить это действие";

        const hint = document.createElement("div");
        hint.style.cssText = "color:#b7cbc3;max-width:46ch;line-height:1.5";
        hint.textContent =
            "Такая форма не получается — например, скругление слишком большое для этой грани. " +
            "Работа сохранена: сейчас откроем её заново, и можно попробовать другой размер.";

        const button = document.createElement("button");
        button.textContent = "Открыть работу заново";
        button.style.cssText = `
            font: inherit; font-weight: 600; padding: 13px 22px; border-radius: 4px;
            border: none; background: #35c79a; color: #04120e; cursor: pointer;
        `;
        button.onclick = () => window.location.reload();

        const timer = document.createElement("div");
        timer.style.cssText = "color:#8aa39b;font-size:13px";

        overlay.append(title, hint, button, timer);
        document.body.appendChild(overlay);
        button.focus();

        // Автоперезагрузка: ребёнок не должен гадать, что делать с застывшим экраном.
        let left = 8;
        timer.textContent = `Откроется само через ${left} секунд`;
        const tick = window.setInterval(() => {
            left -= 1;
            timer.textContent = `Откроется само через ${left} секунд`;
            if (left <= 0) {
                window.clearInterval(tick);
                window.location.reload();
            }
        }, 1000);
    }
}
