// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: окно «Что скачать?» (B-103).
//
// Скачивается вся работа целиком, без выделения мышью, и файл называется именем
// работы. Апстримная команда `file.export` этого не умеет: она сперва требует
// выделить узлы мышью, формат берёт из панели свойств слева, а имя файла — из
// `nodes[0].name`, из-за чего на компьютере класса копится десяток «Куб.stl».
// Поэтому окно зовёт `dataExchange.export` само, а `file.export` из ленты убран
// (ТЗ, «Вторые двери»).

import { GHOST_BUTTON, openModal, PRIMARY_BUTTON } from "./modal";

export interface DownloadDialogOptions {
    /** Имя работы — оно же имя файла. */
    workTitle: () => string;
    /** Сколько деталей выделено: выделение — уточнение, а не условие. */
    selectedCount: () => number;
    /** `undefined` — в работе нет ни одной фигуры. */
    exportModel: (type: ".stl" | ".step", onlySelected: boolean) => Promise<BlobPart[] | undefined>;
    /** Кадр канвы как data-URL (`activeView.toImage()`). */
    screenshot: () => string | undefined;
    /** Тело работы (`.cd`) — запасная копия, сохраняется без сервера. */
    workFile: () => string | undefined;
}

type Choice = "stl" | "step" | "image" | "work";

const CHOICES: { id: Choice; text: string; hint: string }[] = [
    { id: "stl", text: "Для 3D-печати", hint: "файл STL — его понимает принтер" },
    { id: "step", text: "Для другой программы", hint: "файл STEP" },
    { id: "image", text: "Картинку", hint: "как сейчас видно на экране" },
    { id: "work", text: "Файл работы", hint: "запасная копия на твоём компьютере" },
];

/** Имя работы едет в имя файла: убираем то, что файловая система не примет. */
function fileName(title: string, extension: string) {
    const clean = title.replace(/[\\/:*?"<>|]/g, " ").trim();
    return `${clean || "Работа"}${extension}`;
}

function saveUrl(url: string, name: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
}

function saveBlob(parts: BlobPart[], name: string) {
    const url = URL.createObjectURL(new Blob(parts));
    saveUrl(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Последний рубеж против потери урока: та же кнопка стоит в баннере трёх
 * неудачных сохранений, и сохраняет она настоящую работу, а не картинку.
 */
export function saveWorkFile(options: DownloadDialogOptions): boolean {
    const body = options.workFile();
    if (!body) return false;
    saveBlob([body], fileName(options.workTitle(), ".cd"));
    return true;
}

export function openDownloadDialog(options: DownloadDialogOptions, returnFocus?: HTMLElement | null) {
    const modal = openModal({ title: "Что скачать?", returnFocus });

    let choice: Choice = "stl";
    const group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "Что скачать");
    group.style.cssText = "display:grid;gap:6px";

    for (const item of CHOICES) {
        const row = document.createElement("label");
        row.style.cssText = `
            display: flex; gap: 10px; align-items: baseline; padding: 8px 10px;
            border: 1px solid #c7d3ce; border-radius: 6px; cursor: pointer;
        `;
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "download-what";
        radio.value = item.id;
        radio.checked = item.id === "stl";
        radio.style.cssText = "margin:0;min-width:16px;min-height:16px";
        radio.onchange = () => {
            choice = item.id;
            hideProblem();
        };
        const words = document.createElement("span");
        const text = document.createElement("span");
        text.textContent = item.text;
        text.style.cssText = "font-weight:600";
        const hint = document.createElement("span");
        hint.textContent = ` — ${item.hint}`;
        hint.style.cssText = "color:#4a625b;font-size:12.5px";
        words.append(text, hint);
        row.append(radio, words);
        group.append(row);
    }
    modal.card.append(group);

    // Выделение — уточнение, а не условие: галочка снята по умолчанию, и без неё
    // скачивается вся работа.
    const selected = options.selectedCount();
    let onlySelected = false;
    if (selected > 0) {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;gap:8px;align-items:center;cursor:pointer";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.style.cssText = "margin:0;min-width:16px;min-height:16px";
        box.onchange = () => {
            onlySelected = box.checked;
        };
        const text = document.createElement("span");
        text.textContent = `Только выделенное (${selected} ${detailWord(selected)})`;
        row.append(box, text);
        modal.card.append(row);
    }

    const problem = document.createElement("div");
    problem.hidden = true;
    problem.setAttribute("role", "alert");
    problem.style.cssText = `
        padding: 8px 10px; border-radius: 6px; font-size: 13px;
        background: #fdecec; border: 1px solid #b91c1c; color: #7f1d1d;
    `;
    modal.card.append(problem);

    function showProblem(text: string) {
        problem.textContent = text;
        problem.hidden = false;
    }
    function hideProblem() {
        problem.hidden = true;
    }

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена";
    cancel.style.cssText = GHOST_BUTTON;
    cancel.onclick = () => modal.close();

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Скачать";
    confirm.style.cssText = PRIMARY_BUTTON;
    confirm.onclick = async () => {
        hideProblem();
        confirm.disabled = true;
        try {
            if (await run()) modal.close();
        } finally {
            confirm.disabled = false;
        }
    };

    modal.footer.append(cancel, confirm);

    async function run(): Promise<boolean> {
        const title = options.workTitle();
        if (choice === "work") {
            if (!saveWorkFile(options)) {
                showProblem("Работа ещё не открылась. Подожди секунду и попробуй снова");
                return false;
            }
            return true;
        }
        if (choice === "image") {
            const url = options.screenshot();
            if (!url) {
                showProblem("Не получилось снять картинку. Попробуй ещё раз");
                return false;
            }
            // Кадр канвы приходит адресом data:, поэтому сохраняем ссылкой, а не
            // через `download()` из ядра: тот принимает куски файла, не адрес.
            saveUrl(url, fileName(title, ".png"));
            return true;
        }
        const type = choice === "stl" ? ".stl" : ".step";
        const data = await options.exportModel(type, onlySelected);
        if (!data) {
            // Окно не закрывается: иначе ребёнок нажал «Скачать» — и ничего.
            showProblem("В работе пока нечего печатать — сначала собери фигуру");
            return false;
        }
        saveBlob(data, fileName(title, type));
        return true;
    }
}

function detailWord(count: number) {
    const tail = count % 100;
    if (tail >= 11 && tail <= 14) return "деталей";
    const last = count % 10;
    if (last === 1) return "деталь";
    if (last >= 2 && last <= 4) return "детали";
    return "деталей";
}
