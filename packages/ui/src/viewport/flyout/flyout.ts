// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type I18nKeys, type MessageType, PubSub, type Result } from "@chili3d/core";
import style from "./flyout.module.css";
import { Input } from "./input";
import { Tip } from "./tip";

// Форк «Макетки»: просвет между полем и верхним краем экранной клавиатуры.
// Вплотную к краю поле выглядит обрезанным, и непонятно, всё ли видно. (B-276)
const KEYBOARD_GAP = 8;

export class Flyout extends HTMLElement {
    private _tip: HTMLElement | undefined;
    private _input: Input | undefined;
    private lastFocus: HTMLElement | null = null;

    constructor() {
        super();
        this.className = style.root;
    }

    connectedCallback(): void {
        PubSub.default.sub("showFloatTip", this.showTip);
        PubSub.default.sub("clearFloatTip", this.clearTip);
        PubSub.default.sub("showInput", this.displayInput);
        PubSub.default.sub("clearInput", this.clearInput);
    }

    disconnectedCallback(): void {
        PubSub.default.remove("showFloatTip", this.showTip);
        PubSub.default.remove("clearFloatTip", this.clearTip);
        PubSub.default.remove("showInput", this.displayInput);
        PubSub.default.remove("clearInput", this.clearInput);
        this.stopWatchingKeyboard();
    }

    private readonly showTip = (dom: HTMLElement | { level: MessageType; msg: string }) => {
        if (dom instanceof HTMLElement) {
            this._tip?.remove();

            this._tip = dom;
            this.append(this._tip);
        } else if (this._tip instanceof Tip) {
            this._tip.set(dom.msg, dom.level);
        } else {
            this._tip?.remove();

            this._tip = new Tip(dom.msg, dom.level);
            this.append(this._tip);
        }
    };

    private readonly clearTip = () => {
        if (this._tip !== undefined) {
            this._tip.remove();
            this._tip = undefined;
        }
    };

    private readonly displayInput = (text: string, handler: (text: string) => Result<string, I18nKeys>) => {
        if (this._input === undefined) {
            this.lastFocus = document.activeElement as HTMLElement;
            this._input = new Input(text, handler);
            this._input.onCancelled(this.clearInput);
            this._input.onCompleted(this.clearInput);
            this.append(this._input);
            // Форк «Макетки»: клавиатура выезжает уже после фокуса и о самом
            // фокусе ничего не сообщает — единственный сигнал о ней приходит от
            // `visualViewport`. На iOS страница при этом ещё и подъезжает, поэтому
            // слушаем не только `resize`, но и `scroll`. (B-276)
            window.visualViewport?.addEventListener("resize", this.liftAboveKeyboard);
            window.visualViewport?.addEventListener("scroll", this.liftAboveKeyboard);
            setTimeout(() => this._input?.focus());
        }
    };

    private readonly clearInput = () => {
        if (this._input !== undefined) {
            this.stopWatchingKeyboard();
            this.removeChild(this._input);
            this._input.dispose();
            this._input = undefined;
            this.lastFocus?.focus();
        }
    };

    // Форк «Макетки»: записка встаёт туда, где ребёнок ткнул пальцем, а на планшете
    // это часто ниже выехавшей клавиатуры — число тогда набирают вслепую.
    // `visualViewport` — оставшаяся видимой часть окна; поднимаем записку ровно
    // настолько, чтобы она снова попала в неё. Сдвигаем `transform`, а не `top`:
    // `top` на каждом движении указателя переписывает `Viewport`. (B-276)
    private readonly liftAboveKeyboard = () => {
        const visible = window.visualViewport;
        if (!visible || this._input === undefined) return;

        this.style.transform = "";
        const box = this.getBoundingClientRect();
        const hidden = box.bottom + KEYBOARD_GAP - (visible.offsetTop + visible.height);
        // Выше верхнего края видимой части не поднимаем: там записку не видно тоже.
        const lift = Math.min(hidden, box.top - visible.offsetTop);
        if (lift > 0) this.style.transform = `translateY(${-lift}px)`;
    };

    private stopWatchingKeyboard() {
        window.visualViewport?.removeEventListener("resize", this.liftAboveKeyboard);
        window.visualViewport?.removeEventListener("scroll", this.liftAboveKeyboard);
        this.style.transform = "";
    }
}

customElements.define("chili-flyout", Flyout);
