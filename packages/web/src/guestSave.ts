// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: «Сохранить работу» из песочницы (B-096).
//
// Гость с лендинга собирает модель в песочнице. Ссылка «Зарегистрироваться»
// уводила его на отдельную страницу вместе со сценой — собранное пропадало
// молча, и после подтверждения почты человек попадал в пустой кабинет
// (проход 02.09, находки Ш-4 и Ш-5). Поэтому регистрация и вход происходят
// здесь же, поверх мастерской, а сцена уезжает на сервер тем же движением:
//
//   • нет учётки — сцена сохраняется работой новой учётки сразу, до
//     подтверждения почты; ссылка из письма открывает уже её;
//   • учётка есть — вход прямо отсюда, и /api/guest/adopt переносит сцену.

type Tab = "register" | "login";

/** Ответ оболочки: поля разные у разных запросов, поэтому все необязательные. */
interface Answer {
    ok: boolean;
    data: { message?: string; email?: string; testLink?: string; id?: number; kind?: string };
}

export interface GuestSaveOptions {
    /** Сцена в момент нажатия: сериализованный документ мастерской. */
    scene: () => unknown;
    /** Что переносим: модель или схема (песочница схем — B-098). */
    kind?: "3d" | "circuits";
}

const PANEL = `
    position: fixed; inset: 0; z-index: 1200; display: none;
    align-items: center; justify-content: center; padding: 16px;
    background: rgba(11,31,26,.45);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
`;

const CARD = `
    width: min(420px, 100%); max-height: calc(100vh - 32px); overflow: auto;
    background: var(--panel-background-color, #fff);
    color: var(--foreground-color, #0b1f1a);
    border-radius: 10px; box-shadow: 0 24px 60px -24px rgba(11,31,26,.6);
    padding: 22px; display: grid; gap: 12px; font-size: 14px;
`;

const INPUT = `
    width: 100%; box-sizing: border-box; font: inherit; padding: 9px 10px;
    border: 1px solid var(--border-color, #c7d3ce); border-radius: 6px;
    background: var(--background-color, #fff); color: inherit;
`;

const PRIMARY = `
    font: inherit; font-weight: 600; padding: 10px 14px; border-radius: 6px;
    border: none; background: #1c6dbd; color: #fff; cursor: pointer;
`;

const GHOST = `
    font: inherit; padding: 8px 12px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--border-color, #c7d3ce); background: none; color: inherit;
`;

export class GuestSave {
    private readonly root: HTMLElement;
    private readonly card: HTMLElement;
    private csrf = "";
    private busy = false;

    constructor(private readonly options: GuestSaveOptions) {
        this.root = document.createElement("div");
        this.root.style.cssText = PANEL;
        this.card = document.createElement("div");
        this.card.style.cssText = CARD;
        this.root.appendChild(this.card);

        // Клик мимо карточки закрывает; клавиши внутри не должны доходить до
        // мастерской — иначе Delete в поле пароля удаляет деталь на сцене.
        this.root.addEventListener("mousedown", (e) => {
            if (e.target === this.root) this.close();
        });
        for (const type of ["keydown", "keyup", "keypress"]) {
            this.card.addEventListener(type, (e) => e.stopPropagation());
        }
        this.root.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Escape" && !this.busy) this.close();
        });

        document.body.appendChild(this.root);
    }

    open(tab: Tab = "register") {
        this.root.style.display = "flex";
        this.showForm(tab);
        void this.ensureCsrf();
    }

    close() {
        this.root.style.display = "none";
    }

    /** Токен формы лежит в куке, которую скрипту не прочитать, — спрашиваем сервер. */
    private async ensureCsrf(): Promise<string> {
        if (this.csrf) return this.csrf;
        try {
            const response = await fetch("/auth/guest/csrf", { credentials: "same-origin" });
            if (response.ok) this.csrf = (await response.json()).csrf ?? "";
        } catch {
            this.csrf = "";
        }
        return this.csrf;
    }

    /* ---------- сборка карточки ---------- */

    private title(text: string, lede: string) {
        const h = document.createElement("div");
        h.style.cssText = "font-size:19px;font-weight:700";
        h.textContent = text;
        const p = document.createElement("div");
        p.style.cssText = "color:var(--foreground-color,#0b1f1a);opacity:.75;line-height:1.4";
        p.textContent = lede;
        this.card.append(h, p);
    }

    private field(label: string, type: string, autocomplete: AutoFill): HTMLInputElement {
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:grid;gap:5px";
        const name = document.createElement("span");
        name.textContent = label;
        const input = document.createElement("input");
        input.type = type;
        input.autocomplete = autocomplete;
        input.style.cssText = INPUT;
        wrap.append(name, input);
        this.card.appendChild(wrap);
        return input;
    }

    private check(html: string): HTMLInputElement {
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:flex;gap:8px;align-items:flex-start;line-height:1.35";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.style.cssText = "margin-top:2px";
        const text = document.createElement("span");
        text.innerHTML = html;
        wrap.append(input, text);
        this.card.appendChild(wrap);
        return input;
    }

    private error(): HTMLElement {
        const el = document.createElement("div");
        el.style.cssText = "color:#a3261b;line-height:1.35;display:none";
        el.setAttribute("data-guest-error", "");
        this.card.appendChild(el);
        return el;
    }

    private row(): HTMLElement {
        const el = document.createElement("div");
        el.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:4px";
        this.card.appendChild(el);
        return el;
    }

    private link(text: string, onClick: () => void): HTMLElement {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = text;
        el.style.cssText =
            "font:inherit;background:none;border:none;padding:0;color:#1c6dbd;cursor:pointer;text-decoration:underline";
        el.onclick = onClick;
        return el;
    }

    private showForm(tab: Tab) {
        this.card.innerHTML = "";
        if (tab === "register") this.registerForm();
        else this.loginForm();
    }

    /* ---------- регистрация ---------- */

    private registerForm() {
        this.title("Сохранить работу", "Заведите мастерскую — то, что вы собрали, переедет в неё.");
        const name = this.field("Как вас называть", "text", "name");
        const email = this.field("Почта", "email", "email");
        email.setAttribute("data-guest-email", "");
        const password = this.field("Пароль — не короче 8 знаков", "password", "new-password");
        const age = this.check("Мне есть 14 лет, либо я взрослый");
        const agree = this.check(
            'Согласен с <a href="/agreement" target="_blank">условиями</a> и ' +
                '<a href="/privacy" target="_blank">политикой данных</a>',
        );
        const error = this.error();

        const row = this.row();
        const submit = document.createElement("button");
        submit.type = "button";
        submit.style.cssText = PRIMARY;
        submit.textContent = "Сохранить и зарегистрироваться";
        submit.setAttribute("data-guest-submit", "");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.style.cssText = GHOST;
        cancel.textContent = "Не сейчас";
        cancel.onclick = () => this.close();
        row.append(submit, cancel);

        const have = this.row();
        have.append(
            document.createTextNode("Уже есть учётка? "),
            this.link("Войти", () => this.showForm("login")),
        );

        submit.onclick = async () => {
            error.style.display = "none";
            if (!age.checked || !agree.checked) {
                return this.fail(error, "Отметьте обе галочки — без них зарегистрировать не можем.");
            }
            const answer = await this.post(submit, "Сохраняем…", "/auth/guest/register", {
                name: name.value,
                email: email.value,
                password: password.value,
                age_ok: age.checked,
                agree: agree.checked,
                kind: this.options.kind ?? "3d",
                scene: this.options.scene(),
            });
            if (!answer)
                return this.fail(error, "Не получилось отправить. Проверьте связь и попробуйте ещё раз.");
            if (!answer.ok)
                return this.fail(error, answer.data.message || "Проверьте поля и попробуйте ещё раз.");
            this.showSent(String(answer.data.email || email.value), String(answer.data.testLink || ""));
        };
    }

    private showSent(email: string, testLink: string) {
        this.card.innerHTML = "";
        this.title(
            "Проверьте почту",
            `Мы отправили письмо на ${email}. Откройте ссылку из письма — работа откроется в вашей мастерской.`,
        );

        const hint = document.createElement("div");
        hint.style.cssText = "line-height:1.4;opacity:.75";
        hint.textContent =
            "Письмо приходит за минуту. Не нашли — загляните в папку «Спам». " +
            "Эту вкладку можно закрыть: работа уже у нас.";
        this.card.appendChild(hint);

        const known = document.createElement("div");
        known.style.cssText = "line-height:1.4;opacity:.75";
        known.textContent =
            "Если на этот адрес учётка уже была, письмо скажет об этом — тогда вернитесь сюда и войдите, " +
            "работа перенесётся.";
        this.card.appendChild(known);

        // Тест-люк: адресам на @example.invalid ссылка показывается на месте —
        // e2e проходит весь путь без почтового ящика (так же на /auth/register).
        if (testLink) {
            const link = document.createElement("a");
            link.href = testLink;
            link.textContent = testLink;
            link.style.cssText = "word-break:break-all;font-family:ui-monospace,monospace;font-size:12px";
            link.setAttribute("data-test-link", "");
            this.card.appendChild(link);
        }

        const row = this.row();
        const login = document.createElement("button");
        login.type = "button";
        login.style.cssText = GHOST;
        login.textContent = "Войти";
        login.onclick = () => this.showForm("login");
        const close = document.createElement("button");
        close.type = "button";
        close.style.cssText = GHOST;
        close.textContent = "Закрыть";
        close.onclick = () => this.close();
        row.append(login, close);
    }

    /* ---------- вход ---------- */

    private loginForm() {
        this.title("Вход", "Войдите — собранное переедет в вашу мастерскую.");
        const email = this.field("Почта", "email", "email");
        email.setAttribute("data-guest-email", "");
        const password = this.field("Пароль", "password", "current-password");
        const error = this.error();

        const row = this.row();
        const submit = document.createElement("button");
        submit.type = "button";
        submit.style.cssText = PRIMARY;
        submit.textContent = "Войти и сохранить";
        submit.setAttribute("data-guest-submit", "");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.style.cssText = GHOST;
        cancel.textContent = "Не сейчас";
        cancel.onclick = () => this.close();
        row.append(submit, cancel);

        const have = this.row();
        have.append(
            document.createTextNode("Учётки ещё нет? "),
            this.link("Зарегистрироваться", () => this.showForm("register")),
        );
        const forgot = this.row();
        const forgotLink = document.createElement("a");
        forgotLink.href = "/auth/forgot";
        forgotLink.textContent = "Забыли пароль?";
        forgotLink.style.cssText = "color:#1c6dbd";
        forgot.appendChild(forgotLink);

        submit.onclick = async () => {
            error.style.display = "none";
            const entered = await this.post(submit, "Входим…", "/auth/guest/login", {
                email: email.value,
                password: password.value,
            });
            if (!entered)
                return this.fail(error, "Не получилось войти. Проверьте связь и попробуйте ещё раз.");
            if (!entered.ok) return this.fail(error, entered.data.message || "Не подошли почта или пароль.");
            await this.adopt(submit, error);
        };
    }

    /** Перенос сцены: делается сразу после входа, пока она ещё на экране. */
    private async adopt(button: HTMLButtonElement, error: HTMLElement) {
        const moved = await this.post(button, "Переносим работу…", "/api/guest/adopt", {
            kind: this.options.kind ?? "3d",
            scene: this.options.scene(),
        });
        if (!moved?.ok) {
            const message = moved?.data.message || "Войти получилось, а перенести работу — нет.";
            this.fail(error, `${message} Мастерская открыта: /projects`);
            return;
        }
        const id = moved.data.id;
        const kind = moved.data.kind === "circuits" ? "circuits" : "3d";
        window.location.assign(`/${kind}/${id}`);
    }

    /* ---------- служебное ---------- */

    private fail(error: HTMLElement, message: string) {
        error.textContent = message;
        error.style.display = "block";
    }

    private async post(
        button: HTMLButtonElement,
        waiting: string,
        url: string,
        payload: Record<string, unknown>,
    ): Promise<Answer | null> {
        const label = button.textContent ?? "";
        this.busy = true;
        button.disabled = true;
        button.textContent = waiting;
        try {
            const response = await fetch(url, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csrf: await this.ensureCsrf(), ...payload }),
            });
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok, data };
        } catch {
            return null;
        } finally {
            this.busy = false;
            button.disabled = false;
            button.textContent = label;
        }
    }
}
