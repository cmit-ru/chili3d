// Запись голоса в отзыве «Что-то не так?» (B-290, ТЗ обращений §7.1).
//
// Ребёнок печатает медленнее всех и пишет короче всех — беду ему проще рассказать.
// Поэтому запись стоит рядом с полем текста, а не среди вложений: это замена
// клавиатуре, а не ещё одна скрепка.
//
// Пишем тем, что уже есть в браузере (`MediaRecorder`): своего кодировщика звука в
// бандле нет и не будет (INV-006). Браузер без `MediaRecorder` кнопки не получает
// вовсе — дверь в стену хуже её отсутствия.
//
// Близнец этого файла — `cad-app/web/circuits/voice.js`: общий модуль запрещён
// границей лицензий (редактор под AGPL, оболочка закрыта), и это осознанная плата.
//
// Контракт сервера: POST /api/feedback/<id>/voice — сырым телом, длительность в
// заголовке X-Voice-Seconds. Принимает всех вошедших, включая учеников.

export const СЕКУНД_МАКС = 120;
const ПРЕДУПРЕДИТЬ_НА = 110;
const БИТРЕЙТ = 32_000; // моно-опус: две минуты ≈ 480 КБ

/** Умеет ли этот браузер писать звук. */
export function умеемЗаписывать(): boolean {
    // Через `typeof`, а не по правдивости: в типах браузера `getUserMedia` объявлен
    // обязательным, и обычная проверка была бы «всегда истина» для компилятора —
    // при том что старые и незащищённые контексты `mediaDevices` не дают вовсе.
    return (
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function" &&
        typeof window.Blob === "function" &&
        typeof window.URL?.createObjectURL === "function"
    );
}

/** Кому можно записывать: любому вошедшему, включая ученика (ADR 2026-09-09-0415). */
export function можноГолосом(role: string | undefined | null): boolean {
    return Boolean(role);
}

/** «0:42». */
export function время(с: number): string {
    return `${Math.floor(с / 60)}:${String(с % 60).padStart(2, "0")}`;
}

/**
 * Первый тип, который браузер согласен писать: Chrome и Firefox — webm/opus,
 * Safari — mp4/aac. Пустая строка значит «пиши чем хочешь»: старый Safari умеет
 * писать, но не умеет отвечать на `isTypeSupported`.
 */
export function типЗаписи(): string {
    const варианты = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const R = window.MediaRecorder;
    if (!R?.isTypeSupported) return "";
    return варианты.find((т) => R.isTypeSupported(т)) ?? "";
}

const КНОПКА = `
    font: inherit; font-size: 14px; cursor: pointer; padding: 6px 11px; border-radius: 6px;
    border: 1px solid var(--border-color, #c7d3ce); background: var(--background-color, #f6f8f7);
    color: inherit;
`;
const ГЛАВНАЯ = `
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 6px 11px;
    border-radius: 6px; border: 1px solid #1c6dbd; background: #1c6dbd; color: #fff;
`;
const МЕЛКАЯ = `${КНОПКА} font-size: 13px; padding: 4px 9px;`;

export interface ЗаписьГолоса {
    /** Узел с кнопкой и всеми состояниями записи: класть в карточку окна. */
    узел: HTMLElement;
    /** Готовая запись или null. */
    готова: () => Blob | null;
    /** Сколько секунд записано. */
    секунды: () => number;
    /** Отпустить микрофон: при закрытии окна и после отправки. */
    отпустить: () => void;
}

/**
 * Собрать управляющий элемент записи.
 * @param сказать куда писать беду и подсказки (заметка окна отзыва)
 */
export function записьГолоса(сказать: (текст: string) => void): ЗаписьГолоса {
    const узел = document.createElement("div");
    узел.style.cssText = "display:grid;gap:6px;justify-items:start";

    const кнопка = document.createElement("button");
    кнопка.type = "button";
    кнопка.textContent = "🎤 Рассказать голосом";
    кнопка.setAttribute("data-fb-rec", "");
    кнопка.style.cssText = КНОПКА;

    const живая = document.createElement("div");
    живая.hidden = true;
    живая.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";

    const готовая = document.createElement("div");
    готовая.hidden = true;
    готовая.style.cssText = "display:grid;gap:5px;width:100%";

    узел.append(кнопка, живая, готовая);

    let запись: Blob | null = null;
    let секунд = 0;
    let часыСек = 0;
    let поток: MediaStream | null = null;
    let рекордер: MediaRecorder | null = null;
    let часы: number | null = null;
    let ссылка: string | null = null;
    let счётчик: HTMLElement | null = null;
    let полоска: HTMLElement | null = null;

    // Микрофон отпускаем всегда и сразу: горящий в браузере значок записи пугает
    // сильнее самой поломки, из-за которой человек сюда пришёл.
    const отпустить = () => {
        if (часы !== null) {
            window.clearInterval(часы);
            часы = null;
        }
        if (рекордер && рекордер.state !== "inactive") {
            try {
                рекордер.stop();
            } catch {
                /* уже стоит */
            }
        }
        рекордер = null;
        for (const t of поток?.getTracks() ?? []) t.stop();
        поток = null;
    };

    const забыть = () => {
        запись = null;
        секунд = 0;
        готовая.hidden = true;
        готовая.replaceChildren();
        кнопка.hidden = false;
        if (ссылка) {
            URL.revokeObjectURL(ссылка);
            ссылка = null;
        }
    };

    const показать = (готово: Blob) => {
        живая.hidden = true;
        кнопка.hidden = true;
        готовая.hidden = false;
        готовая.replaceChildren();
        if (ссылка) URL.revokeObjectURL(ссылка);
        ссылка = URL.createObjectURL(готово);
        const плеер = document.createElement("audio");
        плеер.controls = true;
        плеер.src = ссылка;
        плеер.setAttribute("data-fb-voice-play", "");
        плеер.style.cssText = "width:100%;height:34px";
        const ряд = document.createElement("div");
        ряд.style.cssText = "display:flex;align-items:center;gap:8px";
        const сказано = document.createElement("span");
        сказано.style.cssText = "opacity:.75;font-size:13px";
        сказано.textContent = `Записано: ${время(секунд)}`;
        const заново = document.createElement("button");
        заново.type = "button";
        заново.textContent = "Перезаписать";
        заново.style.cssText = МЕЛКАЯ;
        заново.onclick = () => {
            забыть();
            начать();
        };
        const убрать = document.createElement("button");
        убрать.type = "button";
        убрать.textContent = "Убрать";
        убрать.setAttribute("data-fb-voice-drop", "");
        убрать.style.cssText = МЕЛКАЯ;
        убрать.onclick = забыть;
        ряд.append(сказано, заново, убрать);
        готовая.append(плеер, ряд);
    };

    const остановить = () => {
        секунд = Math.max(1, часыСек);
        живая.hidden = true;
        if (рекордер && рекордер.state !== "inactive") рекордер.stop();
        else отпустить();
    };

    const тик = () => {
        часыСек += 1;
        if (счётчик) счётчик.textContent = время(часыСек);
        if (часыСек === ПРЕДУПРЕДИТЬ_НА) сказать("Осталось 10 секунд.");
        if (часыСек >= СЕКУНД_МАКС) остановить();
    };

    const нарисоватьЖивую = () => {
        живая.hidden = false;
        живая.replaceChildren();
        часыСек = 0;
        const точка = document.createElement("span");
        точка.setAttribute("aria-hidden", "true");
        точка.style.cssText = "width:11px;height:11px;flex:none;border-radius:50%;background:#9c3730";
        точка.animate?.([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], {
            duration: 1400,
            iterations: Infinity,
        });
        счётчик = document.createElement("span");
        счётчик.textContent = "0:00";
        счётчик.setAttribute("data-fb-rec-time", "");
        счётчик.style.cssText = "font-variant-numeric:tabular-nums;min-width:38px";
        const шкала = document.createElement("span");
        шкала.style.cssText =
            "flex:1 1 64px;max-width:140px;height:8px;border-radius:4px;background:#e2e8e6;overflow:hidden";
        полоска = document.createElement("i");
        полоска.style.cssText = "display:block;height:100%;width:0;background:#1f8a6d";
        шкала.append(полоска);
        const стоп = document.createElement("button");
        стоп.type = "button";
        стоп.textContent = "Готово";
        стоп.setAttribute("data-fb-rec-stop", "");
        стоп.style.cssText = ГЛАВНАЯ;
        стоп.onclick = остановить;
        const отмена = document.createElement("button");
        отмена.type = "button";
        отмена.textContent = "Отменить";
        отмена.style.cssText = МЕЛКАЯ;
        отмена.onclick = () => {
            if (рекордер) рекордер.onstop = отпустить;
            отпустить();
            живая.hidden = true;
            кнопка.hidden = false;
            сказать("");
            забыть();
        };
        живая.append(точка, счётчик, шкала, стоп, отмена);
        часы = window.setInterval(тик, 1000);
    };

    // Полоска громкости — не украшение: выключенный или чужой микрофон иначе
    // обнаружится только после того, как человек сорок секунд говорил в тишину.
    const мерятьГромкость = (поймали: MediaStream) => {
        const Аудио =
            window.AudioContext ??
            (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Аудио) return;
        let ctx: AudioContext;
        try {
            ctx = new Аудио();
        } catch {
            return;
        }
        const анализ = ctx.createAnalyser();
        анализ.fftSize = 512;
        ctx.createMediaStreamSource(поймали).connect(анализ);
        const буфер = new Uint8Array(анализ.fftSize);
        const кадр = () => {
            if (!поток) {
                void ctx.close();
                return;
            }
            анализ.getByteTimeDomainData(буфер);
            let пик = 0;
            for (const b of буфер) пик = Math.max(пик, Math.abs(b - 128));
            if (полоска) полоска.style.width = `${Math.min(100, Math.round((пик / 64) * 100))}%`;
            requestAnimationFrame(кадр);
        };
        кадр();
    };

    const идёт = (поймали: MediaStream) => {
        поток = поймали;
        кнопка.disabled = false;
        кнопка.hidden = true;
        кнопка.textContent = "🎤 Рассказать голосом";
        const тип = типЗаписи();
        try {
            рекордер = new MediaRecorder(
                поток,
                тип ? { mimeType: тип, audioBitsPerSecond: БИТРЕЙТ } : { audioBitsPerSecond: БИТРЕЙТ },
            );
        } catch {
            // Тип или битрейт не подошли — пишем как умеет: запись потяжелее лучше,
            // чем никакой.
            рекордер = new MediaRecorder(поток);
        }
        const куски: Blob[] = [];
        рекордер.ondataavailable = (e) => {
            if (e.data?.size) куски.push(e.data);
        };
        рекордер.onstop = () => {
            const тело = new Blob(куски, { type: рекордер?.mimeType || тип || "audio/webm" });
            отпустить();
            if (!тело.size) {
                забыть();
                сказать("Запись не получилась — кажется, микрофон ничего не услышал.");
                return;
            }
            запись = тело;
            показать(тело);
        };
        рекордер.start();
        нарисоватьЖивую();
        мерятьГромкость(поймали);
    };

    function начать() {
        сказать("");
        кнопка.disabled = true;
        кнопка.textContent = "Спрашиваем микрофон…";
        navigator.mediaDevices
            .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
            .then(идёт)
            .catch((e: { name?: string }) => {
                кнопка.disabled = false;
                кнопка.textContent = "🎤 Рассказать голосом";
                // Не пустили и нечем писать — разные беды, и совет у них разный.
                сказать(
                    e?.name === "NotFoundError" || e?.name === "OverconstrainedError"
                        ? "Микрофон не нашёлся. Напишите текстом, пожалуйста."
                        : "Браузер не пустил нас к микрофону. Разрешите записывать звук для этого сайта — или напишите текстом.",
                );
            });
    }

    кнопка.onclick = начать;
    return { узел, готова: () => запись, секунды: () => секунд, отпустить };
}

/** Отправить запись. Возвращает текст беды или null. */
export async function приложитьЗапись(id: number, запись: Blob, секунд: number): Promise<string | null> {
    try {
        const r = await fetch(`/api/feedback/${id}/voice`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/octet-stream",
                "X-Voice-Seconds": String(секунд || 1),
            },
            body: запись,
        });
        const j = (await r.json().catch(() => ({}))) as { message?: string };
        return r.ok ? null : (j.message ?? "Запись не отправилась");
    } catch {
        return "Запись не отправилась — похоже, пропала сеть";
    }
}
