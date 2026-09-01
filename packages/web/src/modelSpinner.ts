// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: пока ядро собирает модель, мастерская уже видна.
//
// Раньше экран загрузки держался до готовности сцены, и на тяжёлой работе
// (модель песочницы — четверть минуты) ребёнок видел замершую полосу: страница
// не отвечает, потому что геометрия считается в главном потоке. Теперь после
// сборки редактора экран загрузки убирается, а ожидание модели показывает эта
// накладка: мастерская за ней видна, а вращение идёт средствами CSS — оно
// продолжается, даже когда главный поток занят расчётом.

export class ModelSpinner extends HTMLElement {
    private readonly label: HTMLElement;

    constructor(text = "Собираем модель…") {
        super();
        this.style.cssText = `
            position: fixed; inset: 0; z-index: 9000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 14px; background: rgba(244,247,246,.72); backdrop-filter: blur(1px);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        `;

        const style = document.createElement("style");
        style.textContent = `
            @keyframes chili-model-spin { to { transform: rotate(360deg); } }
            .chili-model-spinner-ring {
                width: 38px; height: 38px; border-radius: 50%;
                border: 4px solid rgba(11,31,26,.15); border-top-color: #0e7a5f;
                animation: chili-model-spin .9s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
                .chili-model-spinner-ring { animation-duration: 2.4s; }
            }
        `;

        const ring = document.createElement("div");
        ring.className = "chili-model-spinner-ring";

        this.label = document.createElement("div");
        this.label.style.cssText =
            "color: var(--foreground-color,#0b1f1a); font-size: 15px; font-weight: 600";
        this.label.textContent = text;

        this.append(style, ring, this.label);
    }

    /** Подпись меняется по ходу: ребёнок видит, что работа идёт, а не висит. */
    setText(text: string) {
        this.label.textContent = text;
    }
}

customElements.define("chili-model-spinner", ModelSpinner);
