// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: полоса каркаса — имя работы, состояние сохранения, человек
// (B-103, ТЗ `plans/2026-09-02-2200-b103-editor-frame.md`).
//
// Слова, порядок зон и оформление — общие с мастерской схем и заданы одним
// файлом: `agent_docs/frame-contract.md`. Менять слово здесь, не поменяв его
// там и в схемах, нельзя: две мастерские перестанут читаться как один продукт.
//
// Полоса въезжает в готовые места ленты: `#frame-work` (зона «работа») и
// `#frame-user` (зона «человек»). Сами места заводит `ui/src/ribbon/ribbon.ts` —
// пакет `ui` про наш каркас не знает и знать не должен.

import type { ConflictInfo, SaveState } from "@chili3d/storage";
import { type DownloadDialogOptions, openDownloadDialog, saveWorkFile } from "./downloadDialog";
import { FRAME_FONT, showBanner, showNotice, showRememberedNotice } from "./errorBanner";
import { openWorkPicker } from "./openDialog";
import { type MenuItem, openMenu } from "./workMenu";

export interface FrameUser {
    id?: string | number;
    name: string;
    avatar: string;
    role: string;
}

/** Ответ на «Сделать копию»/«Забрать себе»: работа, отказ по месту или ничего. */
export type CopyAnswer = { id: number; title: string } | { refused: string } | null;

export interface FrameBarOptions {
    /** Номер работы; в песочнице его нет. */
    projectId: string | null;
    title: string;
    user: FrameUser | null;
    /** Чужая работа или пример: править нельзя, зато можно забрать себе. */
    viewing: boolean;
    /** Пример из общей полки — забирают его теми же словами, что чужую работу. */
    isExample: boolean;
    /** Песочница с лендинга: сохранять некуда, пока нет мастерской. */
    sandbox: boolean;
    /** Общий компьютер класса: появляется «Передать компьютер». */
    sharedPc: boolean;
    /** Немедленная досылка правок; после неё смотрим на состояние. */
    saveNow: () => Promise<void>;
    /** Есть ли правки, о которых сервер ещё не знает. */
    hasPending: () => boolean;
    /** Окно расхождения версий — его показывает кнопка «Что делать?». */
    openConflict: (info?: ConflictInfo) => void;
    /** «Забрать себе» и «Сделать копию» — одна ручка сервера. */
    copy?: () => Promise<CopyAnswer>;
    /** Имя работы живёт ещё и в теле документа — переносим туда ответ сервера. */
    applyTitle?: (title: string) => void;
    /** «Что-то не так?» — то же окно, что у кнопки в углу. */
    feedback?: () => void;
    /** Песочница и гость: «Сохранить работу» открывает оверлей регистрации. */
    guestSave?: () => void;
    download: DownloadDialogOptions;
}

const STATE_WORDS: Record<SaveState, string> = {
    idle: "✓ Сохранено",
    saving: "◌ Сохраняю…",
    saved: "✓ Сохранено",
    offline: "! Нет интернета",
    conflict: "! Не могу сохранить — работа открыта ещё где-то",
    error: "! Не получилось сохранить — пробую ещё раз",
};

const OFFLINE_BANNER_MS = 30_000;
const FAILURES_BEFORE_BANNER = 3;

let stylesReady = false;

/**
 * Одно правило фокуса на обе мастерские. Живёт в коде форка, а не в апстримном
 * CSS: на `/3d/*` исполняется только наш код (INV-011), а трогать чужие стили
 * ради одной строки — лишний диф при каждом обновлении ядра.
 */
export function ensureFrameStyles() {
    if (stylesReady) return;
    stylesReady = true;
    const style = document.createElement("style");
    style.textContent = `
        :focus-visible { outline: 2px solid #0e7a5f; outline-offset: 2px; }
        [data-frame-bar] button, [data-frame-bar] a { font-family: ${FRAME_FONT}; }
        /* Порядок важности в полосе (ТЗ, «Зона 3»): когда ширины не хватает,
           первой уезжает подпись у аватара — остаётся сам аватар. Имя работы
           сжимается многоточием, но не короче 12 знаков — это нижняя граница
           ширины кнопки имени. Знак, имя и состояние не прячутся никогда. */
        @media (max-width: 900px) { .maketka-user-name { display: none; } }
    `;
    document.head.appendChild(style);
}

/**
 * Низ ленты. Плашки режима и сообщения встают под неё: полосу каркаса и кнопки
 * команд накладка закрывать не должна — из-за этого по ним переставал попадать
 * курсор (отчёт владельца 02.09).
 */
export function topBelowRibbon(): number {
    const ribbon = document.querySelector("chili-ribbon") as HTMLElement | null;
    const rect = ribbon?.getBoundingClientRect();
    return (rect && rect.height > 0 ? rect.bottom : 44) + 8;
}

/**
 * Плашка режима встаёт в одно место — верх по центру, под лентой
 * (`frame-contract.md`, «Правило места»). Раньше каждая плашка выбирала угол
 * сама, и в правом верхнем они наезжали на блок пользователя.
 */
export function placeAsMode(element: HTMLElement) {
    element.dataset["framePlace"] = "top-center";
    element.dataset["frameGroup"] = "mode";
    element.style.position = "fixed";
    element.style.left = "50%";
    element.style.transform = "translateX(-50%)";
    element.style.zIndex = "460";
    const put = () => {
        element.style.top = `${topBelowRibbon()}px`;
    };
    put();
    // Лента к первому кадру ещё не измерена — уточняем, когда она нарисована.
    requestAnimationFrame(put);
    window.addEventListener("resize", put);
}

const NAME_BUTTON = `
    display: inline-flex; align-items: center; gap: 8px; max-width: min(32ch, 30vw);
    min-width: 12ch; min-height: 24px; padding: 4px 10px; cursor: pointer;
    border: 1px solid var(--border-color, #c7d3ce); border-radius: 6px;
    background: none; color: inherit; font: inherit; font-weight: 600;
`;

const USER_BUTTON = `
    display: inline-flex; align-items: center; gap: 8px; min-height: 24px;
    max-width: 22ch; padding: 4px 10px; cursor: pointer; border-radius: 6px;
    border: 1px solid var(--border-color, #c7d3ce); background: none;
    color: inherit; font: inherit;
`;

/**
 * Шпаргалка по мастерской (B-105). Слова — из `agent_docs/frame-contract.md`,
 * ключ `помощь`: то же окно с теми же восемью строками есть в мастерской схем,
 * и расходиться им нельзя.
 */
const HELP_LINES = [
    "Фигуру бери в ленте команд наверху: «Кубик», «Шар», «Цилиндр».",
    "Поставь её в сцене и растяни мышью до нужного размера.",
    "Вытянуть контур в объём, вырезать лишнее, скруглить рёбра, покрасить — там же, на ленте.",
    "Части модели — списком слева: ненужное можно спрятать, не удаляя совсем.",
    "Вращать и приближать сцену — мышью; какая кнопка что делает, написано в самой мастерской.",
    "Ошибся — Ctrl+Z вернёт как было.",
    "Работа сохраняется сама; как идут дела, видно рядом с названием наверху.",
    "Скачать, переименовать, открыть другую работу — нажми на название работы.",
];
const HELP_TITLE = "Как здесь всё устроено";
const HELP_MORE = "Подробнее";
const HELP_ANCHOR = "/docs#rabota-3d";

const HELP_BUTTON = `
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; padding: 0; cursor: pointer; border-radius: 50%;
    border: 1px solid var(--border-color, #c7d3ce); background: none;
    color: #4a625b; font: inherit; font-weight: 700; line-height: 1;
`;

const HELP_PANEL = `
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 470;
    width: min(30rem, calc(100vw - 2rem)); box-sizing: border-box;
    padding: 12px 14px; border-radius: 10px; text-align: left;
    background: #fff; border: 1px solid var(--border-color, #c7d3ce);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); color: #24322e;
`;

const GHOST_LINK = `
    display: inline-flex; align-items: center; min-height: 24px; padding: 4px 9px;
    border: 1px solid var(--border-color, #c7d3ce); border-radius: 6px;
    color: #4a625b; text-decoration: none; font: inherit; cursor: pointer;
    background: none;
`;

export class FrameBar {
    private readonly work: HTMLElement;
    private readonly nameButton: HTMLButtonElement;
    private readonly nameText: HTMLElement;
    private readonly stateText: HTMLElement;
    private readonly conflictButton: HTMLButtonElement;
    private readonly hint: HTMLElement;

    private title: string;
    private state: SaveState = "idle";
    private lastInfo?: ConflictInfo;
    private failures = 0;
    private troubled = false;
    private offlineTimer?: number;
    private fadeTimer?: number;
    private renaming = false;

    constructor(private readonly options: FrameBarOptions) {
        ensureFrameStyles();
        this.title = options.title;

        // Зоны и опоры для спеки объявлены в разметке ленты (`ui/src/ribbon/ribbon.ts`);
        // здесь только раскладка и содержимое.
        this.work = (document.getElementById("frame-work") ?? document.createElement("div")) as HTMLElement;
        this.work.style.position = "relative";
        this.work.style.gap = "10px";

        this.nameText = document.createElement("span");
        this.nameText.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        this.nameText.textContent = this.title;

        const caret = document.createElement("span");
        caret.textContent = "▾";
        caret.setAttribute("aria-hidden", "true");
        caret.style.cssText = "color:#4a625b;font-size:16px;line-height:1";

        // Имя — кнопка, а не надпись: по умолчанию оно совпадает с заголовком
        // карточки, и плоский текст ребёнок читает как «что я делаю», а не как
        // дверь. Рамка и стрелка ▾ и есть признак нажимаемости.
        this.nameButton = document.createElement("button");
        this.nameButton.type = "button";
        this.nameButton.dataset["frameName"] = "";
        this.nameButton.style.cssText = NAME_BUTTON;
        this.nameButton.setAttribute("aria-haspopup", "menu");
        this.nameButton.setAttribute("aria-expanded", "false");
        this.nameButton.append(this.nameText, caret);
        this.nameButton.onclick = () => this.openWorkMenu();

        this.stateText = document.createElement("span");
        this.stateText.dataset["frameState"] = "";
        this.stateText.setAttribute("role", "status");
        this.stateText.style.cssText = "font-size:13px;color:#4a625b;white-space:nowrap";

        this.conflictButton = document.createElement("button");
        this.conflictButton.type = "button";
        this.conflictButton.textContent = "Что делать?";
        this.conflictButton.hidden = true;
        this.conflictButton.style.cssText = `
            font: inherit; font-size: 13px; font-weight: 600; min-height: 24px;
            padding: 3px 10px; border-radius: 6px; cursor: pointer;
            border: 1px solid #b91c1c; background: none; color: #b91c1c;
        `;
        this.conflictButton.onclick = () => this.options.openConflict(this.lastInfo);

        this.hint = document.createElement("div");
        this.hint.hidden = true;
        this.hint.style.cssText = `
            position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 470;
            padding: 4px 8px; border-radius: 6px; font-size: 12.5px; white-space: nowrap;
            background: #fdecec; border: 1px solid #b91c1c; color: #7f1d1d;
        `;

        this.work.append(this.nameButton, this.stateText, this.conflictButton, this.hint);

        const people = document.getElementById("frame-user");
        if (people) {
            people.style.gap = "8px";
            people.append(this.helpBox());
            if (options.user) this.renderUser(people, options.user);
            else people.append(...this.guestButtons());
        }

        this.updateName();
        this.applyState();
        // Слово, отложенное до перехода (разрешение расхождения версий).
        showRememberedNotice([{ text: "Мои работы", onSelect: () => void this.leave("/projects") }]);
    }

    /* ---------- имя работы ---------- */

    private get canRename() {
        return !this.options.viewing && !this.options.sandbox && !!this.options.projectId;
    }

    private updateName() {
        this.nameText.textContent = this.title;
        this.nameButton.title = this.title;
        this.nameButton.setAttribute(
            "aria-label",
            `Имя работы: ${this.title}. Нажми, чтобы открыть меню работы`,
        );
        document.title = `${this.title} — Макетка`;
    }

    private showHint(text: string) {
        this.hint.textContent = text;
        this.hint.hidden = false;
    }

    private hideHint() {
        this.hint.hidden = true;
    }

    private startRename() {
        if (this.renaming || !this.canRename) return;
        this.renaming = true;

        const input = document.createElement("input");
        input.value = this.title;
        input.maxLength = 60;
        input.setAttribute("aria-label", "Новое имя работы");
        input.style.cssText = `
            font: inherit; font-weight: 600; min-height: 24px; padding: 4px 10px;
            max-width: min(32ch, 30vw); min-width: 12ch; border-radius: 6px;
            border: 1px solid #0e7a5f; background: var(--background-color, #fff); color: inherit;
        `;

        // Сторож: без него `blur` после Esc досохраняет отменённое — действующий
        // дефект схем, повторять его здесь незачем.
        let done = false;
        const restore = () => {
            input.replaceWith(this.nameButton);
            this.renaming = false;
            this.hideHint();
            this.nameButton.focus();
        };
        const cancel = () => {
            if (done) return;
            done = true;
            restore();
        };
        const commit = async () => {
            if (done) return;
            const value = input.value.trim();
            if (!value) {
                // Пустое имя не принимается молча: поле остаётся открытым.
                this.showHint("У работы должно быть имя");
                return;
            }
            done = true;
            restore();
            await this.sendRename(value);
        };

        input.oninput = () => {
            if (input.value.length >= 60) this.showHint("Хватит 60 букв");
            else this.hideHint();
        };
        input.onkeydown = (event) => {
            event.stopPropagation();
            if (event.key === "Escape") cancel();
            if (event.key === "Enter") void commit();
        };
        input.onblur = () => void commit();

        this.nameButton.replaceWith(input);
        input.focus();
        input.select();
    }

    private async sendRename(value: string) {
        const id = this.options.projectId;
        if (!id) return;
        try {
            const response = await fetch(`/projects/${id}/rename`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
                body: new URLSearchParams({ title: value }).toString(),
            });
            if (!response.ok) throw new Error(String(response.status));
            // Показываем ровно то, что записал сервер: длину режет он.
            const saved = (await response.json()) as { title?: string };
            this.title = saved.title || value;
            this.updateName();
            this.options.applyTitle?.(this.title);
        } catch {
            showBanner({ key: "rename", text: "Не получилось переименовать. Попробуй ещё раз" });
        }
    }

    /* ---------- состояние сохранения ---------- */

    setSaveState(state: SaveState, info?: ConflictInfo) {
        this.state = state;
        this.lastInfo = info;
        window.clearTimeout(this.fadeTimer);

        if (state === "offline") {
            this.troubled = true;
            if (this.offlineTimer === undefined) {
                this.offlineTimer = window.setTimeout(() => this.offlineBanner(), OFFLINE_BANNER_MS);
            }
        } else {
            window.clearTimeout(this.offlineTimer);
            this.offlineTimer = undefined;
        }

        if (state === "error") {
            this.troubled = true;
            this.failures += 1;
            if (this.failures >= FAILURES_BEFORE_BANNER) this.failureBanner(info?.code);
        }

        if (state === "saved") {
            this.failures = 0;
            if (this.troubled) {
                this.troubled = false;
                // Возвращение сети объявляем: ребёнок, увидевший «Нет интернета»,
                // перестаёт смотреть наверх и тихого перехода не заметит.
                showNotice("Интернет вернулся, всё сохранено");
            }
            this.fadeTimer = window.setTimeout(() => {
                // Через 4 секунды слово тускнеет, но НЕ исчезает: проверить,
                // сохранилась ли работа, ребёнок должен уметь в любой момент.
                this.stateText.style.opacity = "0.65";
            }, 4000);
        }

        this.applyState();
    }

    /**
     * Ребёнок (или преподаватель) нажал «Править» в плашке чужой работы: слово
     * «Только смотрю» уступает место обычной лестнице состояний, а меню работы
     * при следующем открытии соберётся уже как для своей.
     */
    startEditing() {
        this.options.viewing = false;
        this.applyState();
    }

    private applyState() {
        if (this.options.sandbox) {
            this.stateText.textContent = "Ничего не сохраняется";
            this.stateText.style.color = "#4a625b";
            return;
        }
        if (this.options.viewing) {
            this.stateText.textContent = "Только смотрю";
            this.stateText.style.color = "#4a625b";
            return;
        }
        this.stateText.textContent = STATE_WORDS[this.state];
        this.stateText.style.opacity = "1";
        this.stateText.style.color =
            this.state === "conflict" || this.state === "error" || this.state === "offline"
                ? "#b91c1c"
                : "#4a625b";
        this.conflictButton.hidden = this.state !== "conflict";
    }

    private offlineBanner() {
        if (this.state !== "offline") return;
        showBanner({
            key: "offline",
            text: "Интернета нет. Работай дальше — как только он появится, я всё сохраню",
        });
    }

    private failureBanner(code?: string) {
        showBanner({
            key: "save-failed",
            text: "Не получается сохранить. Покажи это преподавателю",
            hint: `покажи преподавателю: работа ${this.options.projectId ?? "—"}, ошибка ${code ?? "нет ответа"}`,
            actions: [
                {
                    text: "Попробовать сейчас",
                    onSelect: async () => {
                        await this.options.saveNow();
                        return this.state === "saved";
                    },
                },
                {
                    text: "Скачать работу себе",
                    onSelect: () => saveWorkFile(this.options.download),
                },
            ],
        });
    }

    /* ---------- меню работы ---------- */

    private statusLine(): string {
        if (this.options.sandbox) return "Ничего не сохраняется";
        if (this.options.viewing) return "Только смотрю";
        return STATE_WORDS[this.state];
    }

    private openWorkMenu() {
        openMenu(this.nameButton, {
            title: "Эта работа",
            status: this.statusLine(),
            items: this.workMenuItems(),
        });
    }

    private workMenuItems(): MenuItem[] {
        const items: MenuItem[] = [];

        items.push({
            text: "Переименовать",
            disabled: !this.canRename,
            reason: this.options.sandbox
                ? "В песочнице работы ещё нет — сначала сохрани её себе"
                : "Это чужая работа: имя меняет только тот, чья она",
            onSelect: () => this.startRename(),
        });

        if (this.options.sandbox) {
            items.push({ text: "Сохранить работу", onSelect: () => this.options.guestSave?.() });
        } else if (this.options.viewing) {
            items.push({ text: "Забрать себе", onSelect: () => void this.makeCopy() });
        } else {
            items.push({ text: "Сохранить сейчас", onSelect: () => void this.options.saveNow() });
            items.push({ text: "Сделать копию", onSelect: () => void this.makeCopy() });
        }

        // Гостю пункты видны, но приглушены и объясняют себя: спрятанное не
        // объясняет, почему его нет (ТЗ, «Окно „Открыть другую работу“»).
        const guest = !this.options.user;
        const guestReason = "Свои работы появятся, когда заведёшь мастерскую";
        const guestAction = { text: "Сохранить работу", onSelect: () => this.options.guestSave?.() };

        items.push({
            text: "Открыть другую работу…",
            separatorBefore: true,
            disabled: guest,
            reason: guestReason,
            reasonAction: guestAction,
            onSelect: () =>
                openWorkPicker({
                    currentId: this.options.projectId,
                    flush: () => this.flush(),
                    returnFocus: this.nameButton,
                }),
        });
        items.push({
            text: "Создать новую работу…",
            disabled: guest,
            reason: guestReason,
            reasonAction: guestAction,
            onSelect: () => void this.leave("/projects/new"),
        });

        items.push({
            text: "Скачать…",
            separatorBefore: true,
            onSelect: () => openDownloadDialog(this.options.download, this.nameButton),
        });

        return items;
    }

    /** «Сделать копию» и «Забрать себе» — одна ручка, разные слова для ребёнка. */
    private async makeCopy() {
        const answer = await this.options.copy?.();
        if (!answer) {
            showBanner({ key: "copy", text: "Копия не получилась. Попробуй ещё раз" });
            return;
        }
        if ("refused" in answer) {
            // Текст отказа приходит с сервера целиком: там сказано, сколько
            // работ и что с ними делать. Слова `quota` ребёнку не показываем.
            showBanner({
                key: "copy",
                text: answer.refused,
                actions: [{ text: "Мои работы", onSelect: () => void this.leave("/projects") }],
            });
            return;
        }
        showNotice(`Копия готова: «${answer.title}»`, [
            { text: "Открыть копию", onSelect: () => void this.leave(`/3d/${answer.id}`) },
        ]);
    }

    /* ---------- уход из мастерской ---------- */

    /** Досылка правок перед уходом. `false` — не удалось, уходить нельзя. */
    async flush(): Promise<boolean> {
        if (!this.options.hasPending()) return true;
        this.stateText.textContent = "◌ Сохраняю…";
        await this.options.saveNow();
        return this.state !== "offline" && this.state !== "error" && this.state !== "conflict";
    }

    /** Любой уход сначала досылает правки — одно правило на все двери. */
    async leave(href: string) {
        if (await this.flush()) {
            window.location.assign(href);
            return;
        }
        showBanner({
            key: "leave",
            text: "Правки не сохранились",
            actions: [
                { text: "Остаться и повторить", onSelect: () => void this.options.saveNow() },
                { text: "Уйти без последних правок", onSelect: () => window.location.assign(href) },
            ],
        });
    }

    /** Ссылка уходит не сразу: сначала досылка, потом переход. */
    guardLink(link: HTMLAnchorElement) {
        link.addEventListener("click", (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            void this.leave(link.getAttribute("href") ?? "/home");
        });
    }

    /* ---------- зона «человек» ---------- */

    /** Гость: вместо аватара одна дверь — «Войти» (`frame-contract.md`, «Роли»).
     *  Рядом с ней — отзыв: у гостя нет меню человека, а сообщить об ошибке он
     *  должен мочь ровно так же, как ученик. Обе кнопки тихие и одинаковые. */
    private guestButtons(): HTMLElement[] {
        const login = document.createElement("a");
        login.href = "/login";
        login.textContent = "Войти";
        login.style.cssText = GHOST_LINK;

        if (!this.options.feedback) return [login];

        const feedback = document.createElement("button");
        feedback.type = "button";
        feedback.textContent = "Что-то не так?";
        feedback.title = "Рассказать нам, что не работает или чего не хватает";
        feedback.style.cssText = `${GHOST_LINK} font: inherit; font-size: 13px;`;
        feedback.onclick = () => this.options.feedback?.();
        return [feedback, login];
    }

    /**
     * Кнопка «?» и шпаргалка под ней. Не меню: обходить стрелками нечего, читать
     * нечего кроме текста. Закрывается Esc, щелчком мимо и повторным нажатием;
     * F1 открывает её же — ребёнок ищет помощь по этой странице, а не по браузеру.
     */
    private helpBox() {
        const box = document.createElement("div");
        box.style.cssText = "position:relative;display:inline-flex";

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "?";
        button.dataset["frameHelp"] = "";
        button.title = HELP_TITLE;
        button.setAttribute("aria-label", HELP_TITLE);
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-expanded", "false");
        button.style.cssText = HELP_BUTTON;

        const panel = document.createElement("div");
        panel.id = "frame-help-panel";
        panel.dataset["frameHelpPanel"] = "";
        panel.hidden = true;
        panel.tabIndex = -1;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", HELP_TITLE);
        panel.style.cssText = HELP_PANEL;
        button.setAttribute("aria-controls", panel.id);

        const head = document.createElement("p");
        head.textContent = HELP_TITLE;
        head.style.cssText = "margin:0 0 8px;font-weight:600;font-size:14px";
        const list = document.createElement("ul");
        list.style.cssText = "margin:0;padding-left:18px;font-size:13px;line-height:1.5";
        for (const line of HELP_LINES) {
            const li = document.createElement("li");
            li.textContent = line;
            list.append(li);
        }
        const more = document.createElement("a");
        more.textContent = HELP_MORE;
        more.href = HELP_ANCHOR;
        more.target = "_blank";
        more.rel = "noopener";
        more.style.cssText = "display:inline-block;margin-top:10px;font-size:13px;color:#0f766e";
        panel.append(head, list, more);
        box.append(button, panel);

        let opened = false;
        const away = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!panel.contains(target) && !button.contains(target)) close(false);
        };
        const open = () => {
            if (opened) return;
            opened = true;
            panel.hidden = false;
            button.setAttribute("aria-expanded", "true");
            panel.focus();
            document.addEventListener("mousedown", away, true);
        };
        function close(returnFocus = true) {
            if (!opened) return;
            opened = false;
            panel.hidden = true;
            button.setAttribute("aria-expanded", "false");
            document.removeEventListener("mousedown", away, true);
            if (returnFocus) button.focus();
        }
        button.onclick = () => (opened ? close() : open());
        panel.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "F1") {
                e.preventDefault();
                if (opened) close();
                else open();
            }
        });
        return box;
    }

    private renderUser(host: HTMLElement, user: FrameUser) {
        // Отдельной кнопки «Передать компьютер» здесь нет: на общем компьютере
        // класса это слово стоит последним пунктом меню человека (см. ниже), и
        // кнопка рядом повторяла бы его слово в слово. В мастерской схем дверь
        // тоже одна — в меню; две мастерские обязаны выглядеть одинаково.

        const button = document.createElement("button");
        button.type = "button";
        button.dataset["frameUser"] = "";
        button.style.cssText = USER_BUTTON;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");

        const avatar = document.createElement("span");
        avatar.textContent = user.avatar || "🙂";
        avatar.style.cssText = "font-size:18px;line-height:1";
        const name = document.createElement("span");
        name.className = "maketka-user-name";
        name.textContent = user.name;
        name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        button.append(avatar, name);
        button.setAttribute("aria-label", `${user.name}. Нажми, чтобы открыть меню`);

        // Куда «домой» из меню человека — по роли и по тому, чья работа открыта
        // (`frame-contract.md`, таблица «Роли»).
        const home = this.options.viewing && user.role === "teacher" ? "/teach" : "/projects";
        const homeText = home === "/teach" ? "К группам" : "Мои работы";

        // Последний пункт — выход, и слово у него зависит не от мастерской, а от
        // того, чей это компьютер (`frame-contract.md`, ключ `выход`; в схемах
        // ровно те же слова). Преподаватель уходит из системы — «Выйти». Ребёнок
        // на общем компьютере класса уступает место соседу — «Передать
        // компьютер». Ребёнок на своём — «Это не я», теми же словами, что в
        // верхней строке кабинета: он их там уже нажимал.
        const leaveText =
            user.role !== "student" ? "Выйти" : this.options.sharedPc ? "Передать компьютер" : "Это не я";

        button.onclick = () =>
            openMenu(button, {
                title: user.name,
                items: [
                    { text: homeText, onSelect: () => void this.leave(home) },
                    ...(this.options.feedback
                        ? [{ text: "Что-то не так?", onSelect: () => this.options.feedback?.() }]
                        : []),
                    {
                        text: leaveText,
                        separatorBefore: true,
                        onSelect: () => void this.leave("/logout-form"),
                    },
                ],
            });

        host.append(button);
    }
}
