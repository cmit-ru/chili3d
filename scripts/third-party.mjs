// Перечень заимствованных компонентов редактора — считается по составу, а не пишется руками.
//
// Зачем: подпункт «б» пункта 5 Правил ведения реестра российского ПО (ПП 1236) —
// «правомерно введено в гражданский оборот»; методические рекомендации оператора требуют
// перечень компонентов с условиями лицензирования и правообладателем. Заявление
// «Свободного офиса» отклонено 15.04.2026 в том числе по этому основанию.
//
// Источник правды — package.json корня и всех рабочих пакетов (`packages/*`): именно
// оттуда rspack собирает бандл. Отдельно перечисляются инструменты сборки — методика
// требует и список «использованных при создании».
//
//   node scripts/third-party.mjs           — переписать раздел в THIRD-PARTY.md
//   node scripts/third-party.mjs --check   — сверить и упасть при расхождении (гейт CI)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const DOC = path.join(root, "THIRD-PARTY.md");
const НАЧАЛО =
    "<!-- ПЕРЕЧЕНЬ-НАЧАЛО: раздел считается скриптом scripts/third-party.mjs, руками не править -->";
const КОНЕЦ = "<!-- ПЕРЕЧЕНЬ-КОНЕЦ -->";

/** Компоненты вне npm: ядро геометрии, среда выполнения образа. */
const ВНЕ_NPM = JSON.parse(await readFile(path.join(here, "third-party-extra.json"), "utf8"));

/** Свои пакеты монорепозитория — не заимствование. */
const СВОИ = /^(chili|@chili)/;

async function собрать() {
    const манифесты = [path.join(root, "package.json")];
    for (const e of await readdir(path.join(root, "packages"), { withFileTypes: true })) {
        if (e.isDirectory()) манифесты.push(path.join(root, "packages", e.name, "package.json"));
    }

    const бандл = new Set();
    const сборка = new Set();
    for (const m of манифесты) {
        let pkg;
        try {
            pkg = JSON.parse(await readFile(m, "utf8"));
        } catch {
            continue;
        }
        for (const имя of Object.keys(pkg.dependencies || {})) {
            if (!СВОИ.test(имя)) бандл.add(имя);
        }
        for (const имя of Object.keys(pkg.devDependencies || {})) {
            if (!СВОИ.test(имя) && !бандл.has(имя)) сборка.add(имя);
        }
    }

    const строки = [];
    for (const [набор, роль] of [
        [бандл, "В браузере (бандл редактора)"],
        [сборка, "Инструмент сборки (в поставку не входит)"],
    ]) {
        for (const имя of [...набор].sort()) строки.push({ ...(await сведения(имя)), роль });
    }
    return строки;
}

/** Правообладатель: из package.json, иначе из строки Copyright в файле лицензии. */
async function правообладатель(dir, pkg) {
    const из = (v) => (typeof v === "string" ? v : v?.name);
    const прямо = из(pkg.author) || (Array.isArray(pkg.contributors) ? из(pkg.contributors[0]) : null);
    if (прямо)
        return прямо
            .replace(/\s*<[^>]*>/, "")
            .replace(/\s*\([^)]*\)/, "")
            .trim();
    try {
        for (const f of await readdir(dir)) {
            if (!/^(LICENSE|LICENCE|COPYING)/i.test(f)) continue;
            const текст = await readFile(path.join(dir, f), "utf8");
            const m = /Copyright\s*(?:\(c\)|©)?\s*([^\n]+)/i.exec(текст);
            if (m)
                return m[1]
                    .replace(/^\d{4}(-\d{4})?,?\s*/, "")
                    .trim()
                    .replace(/\.$/, "");
        }
    } catch {
        /* пакета нет на диске */
    }
    return "—";
}

async function сведения(имя) {
    const dir = path.join(root, "node_modules", имя);
    let pkg = {};
    try {
        pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    } catch {
        /* нет на диске */
    }
    const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    const ссылка = (repo || pkg.homepage || `https://www.npmjs.com/package/${имя}`)
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
        .replace(/^git:\/\//, "https://");
    return {
        имя,
        версия: pkg.version || "—",
        лицензия: pkg.license || pkg.licenses?.[0]?.type || "—",
        правообладатель: await правообладатель(dir, pkg),
        ссылка,
    };
}

function таблица(строки) {
    const шапка =
        "| Компонент | Версия | Правообладатель | Лицензия | Где используется | Источник |\n|---|---|---|---|---|---|";
    const ряд = (r) =>
        `| ${r.имя} | ${r.версия} | ${r.правообладатель} | ${r.лицензия} | ${r.роль} | ${r.ссылка} |`;
    return [
        `Всего компонентов: ${строки.length + ВНЕ_NPM.length}. Пересчитывается командой \`npm run third-party\`.`,
        "",
        "### Компоненты вне npm",
        "",
        шапка,
        ...ВНЕ_NPM.map(ряд),
        "",
        "### Пакеты npm",
        "",
        шапка,
        ...строки.map(ряд),
    ].join("\n");
}

const проверка = process.argv.includes("--check");
const строки = await собрать();
const новый = таблица(строки);
const текст = await readFile(DOC, "utf8");
const i = текст.indexOf(НАЧАЛО);
const j = текст.indexOf(КОНЕЦ);
if (i < 0 || j < 0) {
    console.error(`[third-party] в THIRD-PARTY.md нет меток начала/конца перечня`);
    process.exit(1);
}
const было = текст.slice(i + НАЧАЛО.length, j).trim();

if (проверка) {
    if (было === новый) {
        console.log(
            `[third-party] перечень совпадает с составом (${строки.length + ВНЕ_NPM.length} компонентов)`,
        );
        process.exit(0);
    }
    console.error("[third-party] ПЕРЕЧЕНЬ РАЗОШЁЛСЯ С СОСТАВОМ.");
    const имена = (t) => new Set([...t.matchAll(/^\| ([^|]+) \|/gm)].map((m) => m[1].trim()));
    const старые = имена(было);
    const новые = имена(новый);
    const добавились = [...новые].filter((n) => !старые.has(n));
    const исчезли = [...старые].filter((n) => !новые.has(n));
    if (добавились.length) console.error("  появились, но не в перечне:", добавились.join(", "));
    if (исчезли.length) console.error("  в перечне, но не в составе:", исчезли.join(", "));
    console.error("  Починить: npm run third-party (и проверить совместимость лицензий с AGPL-3.0)");
    process.exit(1);
}

await writeFile(DOC, `${текст.slice(0, i + НАЧАЛО.length)}\n\n${новый}\n\n${текст.slice(j)}`);
console.log(`[third-party] перечень обновлён: ${строки.length + ВНЕ_NPM.length} компонентов`);
