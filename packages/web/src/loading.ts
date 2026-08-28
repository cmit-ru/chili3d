// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: вместо бесконечной крутилки — прогресс в процентах и честный
// экран ошибки (ТЗ §9). Ребёнок ждёт полосу, которая движется; замершую
// крутилку он нажимает повторно и зовёт преподавателя.

const STAGES = [
    { at: 0, text: "Готовим мастерскую" },
    { at: 35, text: "Загружаем инструменты" },
    { at: 70, text: "Почти готово" },
];

export class Loading extends HTMLElement {
    private percent = 0;
    private timer?: number;
    private bar!: HTMLElement;
    private label!: HTMLElement;

    constructor() {
        super();
        this.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 18px; background: var(--background-color, #f4f7f6);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        `;
        this.initUi();
        this.start();
    }

    private initUi() {
        this.label = document.createElement("div");
        this.label.style.cssText = `
            color: var(--foreground-color, #0b1f1a); font-size: 17px; font-weight: 600;
        `;
        this.label.textContent = "Готовим мастерскую…";

        const track = document.createElement("div");
        track.style.cssText = `
            width: min(320px, 70vw); height: 6px; border-radius: 3px;
            background: rgba(11,31,26,.12); overflow: hidden;
        `;
        this.bar = document.createElement("div");
        this.bar.style.cssText = `
            width: 0%; height: 100%; background: #0e7a5f; transition: width .3s ease;
        `;
        track.appendChild(this.bar);

        this.appendChild(this.label);
        this.appendChild(track);
    }

    /**
     * Честного процента загрузки WASM браузер не даёт, поэтому показываем
     * ожидаемый ход: полоса движется и замирает у 95% до готовности сцены.
     */
    private start() {
        this.timer = window.setInterval(() => {
            const step = this.percent < 60 ? 3 : this.percent < 85 ? 1 : 0.4;
            this.percent = Math.min(95, this.percent + step);
            this.bar.style.width = `${this.percent}%`;
            const stage = [...STAGES].reverse().find((s) => this.percent >= s.at);
            if (stage) this.label.textContent = `${stage.text}… ${Math.round(this.percent)}%`;
        }, 220);
    }

    showError(message: string) {
        window.clearInterval(this.timer);
        this.innerHTML = "";
        const title = document.createElement("div");
        title.style.cssText = "font-size:19px;font-weight:700;color:var(--foreground-color,#0b1f1a)";
        title.textContent = "Не получилось загрузить мастерскую";

        const hint = document.createElement("div");
        hint.style.cssText = "color:#4a625b;max-width:44ch;text-align:center;line-height:1.5";
        hint.textContent = "Проверь интернет и попробуй ещё раз. Если не помогает — скажи преподавателю.";

        const retry = document.createElement("button");
        retry.textContent = "Попробовать ещё раз";
        retry.style.cssText = `
            font: inherit; font-weight: 600; padding: 12px 20px; border-radius: 4px;
            border: none; background: #0e7a5f; color: #fff; cursor: pointer;
        `;
        retry.onclick = () => window.location.reload();

        const back = document.createElement("a");
        back.href = "/projects";
        back.textContent = "Вернуться к моим работам";
        back.style.cssText = "color:#4a625b;font-size:14px";

        // Технический текст оставляем мелким: он для преподавателя, не для ребёнка.
        const detail = document.createElement("div");
        detail.style.cssText = "color:#8aa39b;font-size:12px;max-width:60ch;text-align:center";
        detail.textContent = message;

        this.append(title, hint, retry, back, detail);
    }

    dispose() {
        window.clearInterval(this.timer);
    }
}

customElements.define("chili-loading", Loading);
