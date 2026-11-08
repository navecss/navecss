/**
 * AC-used-atoms-52 covers: R17, as amended for `keepFor` and the takes the build reads by
 * CommonJS. A `require()` of a listed package's `cx` export counts as a take the build cannot read
 * even when the same file also imports another of the module's exports, and a dependency that
 * forwards such an export by `module.exports = require(...)`, `exports.name = require(...).name`,
 * or TypeScript's CommonJS emit of a named re-export or an `export *`, is followed to what takes it, as an `export ... from` forward is (a real `vite build` of a
 * scratch app and dependencies).
 */
import { describe, expect, it } from 'vitest'

import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import { KEEP_FLEX, NAVE_APP, run, takenLine } from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const CN = "export { cx as cn } from '@navecss/core/cx'\nexport { Menu } from './menu.js'\n"
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const ACME = {
  'index.js': "export { Menu } from './menu.js'\n",
  'menu.js': MENU_JS,
  'cn.js': CN,
}

/**
 * The error lines of a build, or none when it builds green.
 */
function linesOf(error: string | undefined): string[] {
  return error === undefined ? [] : error.split('\n')
}

describe('AC-used-atoms-52 - a require() of a cx export beside an import of another export', () => {
  const MENU = "import { Menu } from '@acme/ui/cn.js'\nexport const M = Menu\n"
  const packages = { '@acme/ui': ACME }

  const REQUIRE = "const { cn } = require('@acme/ui/cn.js')\nexport const A = cn('block')\n"
  const CREATE_REQUIRE =
    "import { createRequire } from 'node:module'\nexport const A = createRequire(import.meta.url)('@acme/ui/cn.js').cn('block')\n"

  it.each([
    ['require()', REQUIRE],
    [
      'import x = require()',
      "import m = require('@acme/ui/cn.js')\nexport const A = m.cn('block')\n",
    ],
  ])(
    'by %s fails as the same file without the import does, and builds green once cx comes from Nave',
    async (_, take) => {
      const alone = await run(take, packages, { keepFor: KEEP_FLEX })
      const beside = await run(`${MENU}${take}`, packages, { keepFor: KEEP_FLEX })

      expect(alone.error).toBeDefined()
      expect(linesOf(beside.error)).toEqual(linesOf(alone.error))
      const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
    },
  )

  it('by createRequire() fails beside the import as a require() does; alone, Vite puts no module it requires in the graph', async () => {
    const alone = await run(CREATE_REQUIRE, packages, { keepFor: KEEP_FLEX })
    const beside = await run(`${MENU}${CREATE_REQUIRE}`, packages, { keepFor: KEEP_FLEX })
    const required = await run(REQUIRE, packages, { keepFor: KEEP_FLEX })

    expect(alone.error).toBeUndefined()
    expect(linesOf(beside.error)).toEqual(linesOf(required.error))
  })
})

/**
 * The manifest of a CommonJS package whose entry is `index.js`.
 */
const COMMONJS = JSON.stringify({ name: '@other/ui', version: '1.0.0', main: './index.js' })

/**
 * What TypeScript emits as CommonJS for `export { cn, Menu } from '@acme/ui/cn.js'`.
 */
const TS_NAMED = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Menu = exports.cn = void 0;
var cn_js_1 = require("@acme/ui/cn.js");
Object.defineProperty(exports, "cn", { enumerable: true, get: function () { return cn_js_1.cn; } });
Object.defineProperty(exports, "Menu", { enumerable: true, get: function () { return cn_js_1.Menu; } });
`

/**
 * What TypeScript emits as CommonJS for `export * from '@acme/ui/cn.js'`, with its helpers inline.
 */
const TS_STAR = `"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("@acme/ui/cn.js"), exports);
`

/**
 * The same, with `importHelpers` set, so the helper comes from `tslib`.
 */
const TS_STAR_TSLIB = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
tslib_1.__exportStar(require("@acme/ui/cn.js"), exports);
`

/**
 * A stand-in for `tslib`, with the one helper the star emit calls.
 */
const TSLIB = {
  'package.json': JSON.stringify({ name: 'tslib', version: '2.8.1', main: './tslib.js' }),
  'tslib.js':
    'exports.__exportStar = function (m, o) { for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) o[p] = m[p] }\n',
}

describe('AC-used-atoms-52 - a dependency that forwards a cx export by CommonJS is part of the route', () => {
  const APP = "import { cn } from '@other/ui'\nexport const A = cn('block')\n"

  it.each([
    ['module.exports = require(...)', "module.exports = require('@acme/ui/cn.js')\n"],
    ['exports.cn = require(...).cn', "exports.cn = require('@acme/ui/cn.js').cn\n"],
    ["TypeScript's named re-export", TS_NAMED],
    ["TypeScript's export *", TS_STAR],
    ["TypeScript's export * through tslib", TS_STAR_TSLIB],
  ])('for %s', async (_, forward) => {
    const packages = {
      '@acme/ui': ACME,
      '@other/ui': { 'package.json': COMMONJS, 'index.js': forward },
      tslib: TSLIB,
    }
    for (const keepFor of [KEEP_FLEX, { ...KEEP_FLEX, '@other/ui': [] }]) {
      const first = await run(APP, packages, { keepFor })

      expect(linesOf(first.error)).toContain(takenLine('src/App.ts (cn)'))
      expect(first.error).not.toMatch(/cxModules: \[/)
    }
    const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
  })

  it('gives out default when the module only reads __esModule, and does not mark itself', async () => {
    const forward =
      "const isMarked = (m) => Boolean(m && m.__esModule)\nexports.cn = require('@acme/ui/cn.js').cn\nexports.isMarked = isMarked\n"
    const packages = {
      '@acme/ui': ACME,
      '@other/ui': { 'package.json': COMMONJS, 'index.js': forward },
    }
    const built = await run(
      "import ui from '@other/ui'\nexport const A = ui.cn('block')\n",
      packages,
      { keepFor: KEEP_FLEX },
    )

    expect(linesOf(built.error)).toContain(takenLine('src/App.ts (the default export)'))
  })
})
