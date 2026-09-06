// Яндекс.Метрика, счётчик 112319654 (решение владельца 06.09.2026).
//
// Почему файл лежит ЗДЕСЬ, в форке, а не в оболочке, откуда его было бы удобнее
// отдавать одной копией на весь домен: INV-011. Всё, что исполняется на странице
// /3d/*, обязано входить в состав публичного форка под AGPL-3.0. Закрытый скрипт
// оболочки на одной странице с AGPL-бандлом сделал бы страницу комбинированным
// произведением, и тогда AGPL потребовал бы раскрыть исходники оболочки — то есть
// ровно то, в чём ценность продукта, и первый же предмет проверки на экспертизе
// реестра. Поэтому у мастерской своя копия, открытая вместе с остальным форком.
//
// Парная копия — `cad-app/public/metrika.js`. Правите здесь — правьте и там.
(function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=112319654", "ym");

ym(112319654, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
});
