// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: окно «Открыть другую работу» (B-103).
//
// Раньше за другой работой ребёнок уходил в кабинет. Окно показывает тот же
// список, что лента кабинета (`GET /api/projects`), и открывает работу обычным
// переходом по адресу — смены работы «на месте» нет намеренно (ТЗ: полусмена,
// когда осталось старое имя или чужая карточка урока, хуже перезагрузки).
//
// Кабинетную плитку сюда взять нельзя: она серверная и оформлена в `app.css`,
// который на `/3d/*` не грузится и по INV-011 грузиться не может. Поэтому здесь
// свой простой ряд — превью, имя, значок вида, — и никаких обещаний совпасть.

import { GHOST_BUTTON, openModal, PRIMARY_BUTTON } from "./modal";

interface WorkRow {
    /** Номер работы. В ответе он приезжает строкой: в базе это `bigserial`, а
     *  драйвер отдаёт `int8` строкой. Приводим при загрузке — иначе сравнение с
     *  номером из адреса не сходится, и открытая работа предлагает открыть
     *  саму себя (находка браузерной спеки в схемах). */
    id: number;
    title: string;
    kind: string;
    updated_at?: string;
    has_preview?: boolean;
}

export interface WorkPickerOptions {
    /** Номер открытой работы: у неё вместо перехода — «Ты сейчас здесь». */
    currentId: string | null;
    /** Досылка правок перед уходом; `false` — уходить нельзя. */
    flush: () => Promise<boolean>;
    returnFocus?: HTMLElement | null;
}

const SEARCH_FROM = 12;

const ROW = `
    display: flex; gap: 12px; align-items: center; width: 100%; text-align: left;
    font: inherit; padding: 8px; border: 1px solid #c7d3ce; border-radius: 6px;
    background: none; color: inherit; cursor: pointer; min-height: 24px;
`;

function workshopHref(row: WorkRow) {
    return row.kind === "circuits" ? `/circuits/${row.id}` : `/3d/${row.id}`;
}

/** Ребёнок не знает про две мастерские — чужой вид не прячем, а подписываем. */
function kindNote(row: WorkRow) {
    return row.kind === "circuits"
        ? "Схема — откроется в мастерской схем"
        : "Модель — откроется в мастерской 3D";
}

export function openWorkPicker(options: WorkPickerOptions) {
    const modal = openModal({ title: "Открыть другую работу", returnFocus: options.returnFocus });

    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.textContent = "Ищу твои работы…";
    status.style.cssText = "color:#4a625b";

    const list = document.createElement("div");
    list.style.cssText = "display:grid;gap:8px";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Найти по имени";
    search.setAttribute("aria-label", "Найти по имени");
    search.hidden = true;
    search.style.cssText = `
        font: inherit; min-height: 24px; padding: 8px 10px; border-radius: 6px;
        border: 1px solid #c7d3ce; background: #fff; color: inherit;
    `;

    modal.card.append(status, search, list);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Остаться здесь";
    closeButton.style.cssText = GHOST_BUTTON;
    closeButton.onclick = () => modal.close();
    modal.footer.append(closeButton);

    let rows: WorkRow[] = [];

    const render = () => {
        list.textContent = "";
        const needle = search.value.trim().toLowerCase();
        const shown = needle ? rows.filter((r) => r.title.toLowerCase().includes(needle)) : rows;
        if (shown.length === 0) {
            status.textContent = needle
                ? "Ничего не нашлось. Попробуй другое слово"
                : "Пока это твоя единственная работа";
            status.hidden = false;
            return;
        }
        status.hidden = true;
        for (const row of shown) list.append(rowElement(row));
    };

    const rowElement = (row: WorkRow) => {
        const here = String(row.id) === String(options.currentId);

        const button = document.createElement("button");
        button.type = "button";
        button.style.cssText = ROW;
        // Опоры окна (`frame-contract.md`, «Опоры для теста»): в схемах у рядов
        // свои классы, поэтому спека цепляется за эти атрибуты — они одни на две
        // мастерские.
        button.dataset["openRow"] = "";
        if (here) button.dataset["here"] = "";
        if (here) {
            button.setAttribute("aria-disabled", "true");
            button.style.cursor = "default";
            button.style.background = "#eef6f2";
        }

        const preview = document.createElement("div");
        preview.style.cssText = `
            flex: 0 0 auto; width: 120px; height: 75px; border-radius: 6px; overflow: hidden;
            background: #eef2f0; display: grid; place-items: center; color: #4a625b; font-size: 24px;
        `;
        if (row.has_preview) {
            const image = document.createElement("img");
            image.src = `/api/projects/${row.id}/thumb`;
            image.alt = "";
            image.width = 120;
            image.height = 75;
            image.style.cssText = "width:100%;height:100%;object-fit:cover";
            preview.append(image);
        } else {
            preview.textContent = row.kind === "circuits" ? "🔌" : "🧊";
        }

        const words = document.createElement("div");
        words.style.cssText = "display:grid;gap:2px;min-width:0";
        const name = document.createElement("div");
        name.textContent = row.title;
        name.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const note = document.createElement("div");
        note.textContent = here ? "Ты сейчас здесь" : kindNote(row);
        note.style.cssText = "font-size:12.5px;color:#4a625b";
        words.append(name, note);

        button.append(preview, words);
        if (!here) button.onclick = () => void go(row);
        return button;
    };

    /** Перед любым уходом — досылка правок. Это единственное место в меню,
     *  где можно потерять урок, поэтому молча не уходим никогда. */
    const go = async (row: WorkRow) => {
        const href = workshopHref(row);
        status.hidden = false;
        status.textContent = "Сохраняю…";
        if (await options.flush()) {
            window.location.assign(href);
            return;
        }
        status.textContent = "Правки не сохранились";
        modal.footer.textContent = "";

        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Остаться и повторить";
        retry.style.cssText = PRIMARY_BUTTON;
        retry.onclick = () => void go(row);

        const anyway = document.createElement("button");
        anyway.type = "button";
        anyway.textContent = "Открыть, не сохранив последнее";
        anyway.style.cssText = GHOST_BUTTON;
        anyway.onclick = () => window.location.assign(href);

        modal.footer.append(anyway, retry);
        retry.focus();
    };

    const load = async () => {
        status.hidden = false;
        status.textContent = "Ищу твои работы…";
        try {
            const response = await fetch("/api/projects", {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
            });
            if (!response.ok) throw new Error(String(response.status));
            const answer = (await response.json()) as { items?: WorkRow[] };
            rows = (answer.items ?? []).map((row) => ({ ...row, id: Number(row.id) }));
        } catch {
            status.textContent = "Не получилось открыть список работ";
            modal.footer.textContent = "";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "Попробовать снова";
            retry.style.cssText = PRIMARY_BUTTON;
            retry.onclick = () => void load();
            const stay = document.createElement("button");
            stay.type = "button";
            stay.textContent = "Остаться здесь";
            stay.style.cssText = GHOST_BUTTON;
            stay.onclick = () => modal.close();
            modal.footer.append(stay, retry);
            return;
        }

        // Одна работа — окно не пустое: показываем выход, а не тупик.
        const others = rows.filter((row) => String(row.id) !== String(options.currentId));
        if (others.length === 0) {
            status.hidden = false;
            status.textContent = "Пока это твоя единственная работа";
            list.textContent = "";
            modal.footer.textContent = "";
            const create = document.createElement("button");
            create.type = "button";
            create.textContent = "Создать новую работу";
            create.style.cssText = PRIMARY_BUTTON;
            create.onclick = () => void goTo("/projects/new");
            modal.footer.append(closeButton, create);
            return;
        }

        search.hidden = rows.length <= SEARCH_FROM;
        render();
    };

    const goTo = async (href: string) => {
        status.hidden = false;
        status.textContent = "Сохраняю…";
        if (await options.flush()) window.location.assign(href);
        else status.textContent = "Правки не сохранились";
    };

    search.oninput = render;
    void load();
}
