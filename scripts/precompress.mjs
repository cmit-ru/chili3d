// Предсжатие собранной статики редактора и гейт веса первого экрана.
//
// Зачем: ТЗ §9 требует «предсжатие ассетов + gzip_static» и держит вес первого экрана
// гейтом CI (≤6 МиБ brotli, из них .wasm ≤4,5 МиБ). До 02.09.2026 предсжатия не было
// вовсе: `gzip_static on` в deploy/nginx.conf стоял, но класть рядом `.gz` было некому,
// и мастерская ехала по сети как есть — 19,9 МБ, из них 16,55 МБ ядра геометрии.
// Замер на профиле «10 Мбит/с, RTT 100 мс, CPU ×4»: 17,9 с до видимой мастерской,
// 14 с из них — скачивание .wasm.
//
// Что делает:
//   * рядом с каждым текстовым файлом кладёт `.gz` — их отдаёт `gzip_static`;
//   * рядом с `.wasm` кладёт ещё и `.br` — ядро геометрии сжимается brotli на 1,3 МБ
//     лучше, а это на школьном канале лишняя секунда. Модуля brotli в образе nginx нет,
//     поэтому предсжатый файл отдаётся вручную (см. deploy/nginx.conf, location по .wasm);
//     остальным файлам ручная отдача не окупается — выигрыш там десятки килобайт.
//
//   node scripts/precompress.mjs           — сжать dist
//   node scripts/precompress.mjs --check   — сжать и упасть при превышении бюджета (гейт CI)

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");

/** Что сжимать gzip'ом: всё текстовое, что реально отдаётся браузеру. */
const СЖИМАЕМЫЕ = new Set([".js", ".css", ".html", ".svg", ".json", ".txt", ".wasm"]);

/** Мелочь сжимать бессмысленно: заголовки съедят выигрыш. */
const МИНИМУМ = 1024;

/** Бюджет первого экрана (ТЗ §9). Считаем в МиБ по сжатому размеру. */
const БЮДЖЕТ_ЭКРАНА = 6 * 1024 * 1024;
const БЮДЖЕТ_WASM = 4.5 * 1024 * 1024;

const мб = (n) => (n / 1024 / 1024).toFixed(2);

const brotli = (buf) =>
    zlib.brotliCompressSync(buf, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
    });

async function* файлы(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const полный = path.join(dir, item.name);
        if (item.isDirectory()) yield* файлы(полный);
        else yield полный;
    }
}

async function main() {
    const проверка = process.argv.includes("--check");
    try {
        await stat(dist);
    } catch {
        console.error("dist не собран — сначала `npm run build`");
        process.exit(1);
    }

    let экран = 0;
    let wasm = 0;
    const строки = [];

    for await (const файл of файлы(dist)) {
        const ext = path.extname(файл);
        if (!СЖИМАЕМЫЕ.has(ext)) continue;
        const исходный = await readFile(файл);
        if (исходный.length < МИНИМУМ) continue;

        const gz = zlib.gzipSync(исходный, { level: 9 });
        if (gz.length < исходный.length) await writeFile(`${файл}.gz`, gz);

        // Первый экран — то, что браузер тянет при открытии мастерской: бандл, стили
        // и ядро геометрии. Шрифты и плагины сюда не входят — они не запрашиваются.
        const вЭкране = ext === ".js" || ext === ".css" || ext === ".wasm";
        const br = вЭкране ? brotli(исходный) : null;
        if (ext === ".wasm" && br.length < исходный.length) await writeFile(`${файл}.br`, br);

        if (вЭкране) {
            экран += br.length;
            if (ext === ".wasm") wasm += br.length;
            строки.push(
                `  ${мб(исходный.length)} → ${мб(gz.length)} gz → ${мб(br.length)} br  ` +
                    path.relative(dist, файл),
            );
        }
    }

    строки.sort().reverse();
    console.log("Предсжатие dist: первый экран (МиБ, исходный → gzip → brotli)");
    for (const строка of строки) console.log(строка);
    console.log(
        `  ИТОГО первый экран: ${мб(экран)} МиБ brotli (бюджет ${мб(БЮДЖЕТ_ЭКРАНА)}), ` +
            `из них .wasm ${мб(wasm)} (бюджет ${мб(БЮДЖЕТ_WASM)})`,
    );

    if (!проверка) return;
    const беды = [];
    if (экран > БЮДЖЕТ_ЭКРАНА) беды.push(`первый экран ${мб(экран)} МиБ > ${мб(БЮДЖЕТ_ЭКРАНА)}`);
    if (wasm > БЮДЖЕТ_WASM) беды.push(`.wasm ${мб(wasm)} МиБ > ${мб(БЮДЖЕТ_WASM)}`);
    if (беды.length) {
        console.error(`\nБюджет веса первого экрана (ТЗ §9) превышен:\n  ${беды.join("\n  ")}`);
        process.exit(1);
    }
    console.log("Бюджет веса первого экрана соблюдён.");
}

await main();
