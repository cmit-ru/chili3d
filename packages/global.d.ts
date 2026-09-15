// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

declare module "*.module.css" {
    const classes: any;
    export default classes;
}

declare module "*.wasm" {
    const fun: string;
    export default fun;
}

declare module "*.cur" {
    const cur: string;
    export default cur;
}

declare module "*.svg" {
    const icon: string;
    export default icon;
}

declare module "*.jpg" {
    const path: string;
    export default path;
}

declare module "*.ttf" {
    const value: string;
    export default value;
}

declare module "*.sass";

// Обычный лист стилей, подключаемый ради самого подключения (`import "…/driver.css"`):
// имён из него никто не читает, правила уезжают в бандл целиком. Свои стили редактор
// держит в `*.module.css` выше — объявление нужно чужим пакетам, которые кладут готовый
// css рядом с кодом (driver.js, B-278). Экспортов у такого модуля нет: `import style from`
// на нём не соберётся, и это правильно.
declare module "*.css";

// @rstest/core's JestAssertion interface extends jest.Matchers (normally provided
// by @types/jest); shim the namespace so tsc --noEmit stays clean without the extra dep
declare namespace jest {
    // biome-ignore lint/suspicious/noEmptyInterface: intentional shim for @rstest/core types
    interface Matchers<R, T> {}
}

declare var __APP_VERSION__: string;
declare var __DOCUMENT_VERSION__: string;
declare var __IS_PRODUCTION__: boolean;
