/**
 * AC-used-atoms-52 covers: R17, as amended for a dependency's take of a module that gives out
 * `cx` (a real `vite build` of a scratch app and dependencies). A take the build reads as calls
 * only is the package's own call, and one it reads as a forward continues the walk; any other
 * dependency take stays an error whatever the application imports, and no `keepFor` entry clears
 * it. The barrel of the package is built to CommonJS by TypeScript, the real compiler, and by the
 * other emitters, whose output is kept as they wrote it.
 */
import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, it } from 'vitest'

import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import { KEEP_FLEX, NAVE_APP, run, takenLine } from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const MANIFEST = JSON.stringify({
  name: '@acme/ui',
  version: '1.0.0',
  main: './index.js',
  dependencies: { '@navecss/core': '*' },
})
const CN_ESM = "export { cx as cn } from '@navecss/core/cx'\n"
const MENU_ESM = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const TSLIB = {
  'package.json': JSON.stringify({ name: 'tslib', version: '2.8.1', main: './tslib.js' }),
  'tslib.js':
    'exports.__exportStar = function (m, o) { for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) o[p] = m[p] }\nexports.__importStar = function (m) { return m }\n',
}
const APP_CN = "import { cn } from '@acme/ui'\nexport const A = cn('block')\n"
const ONLY_MENU = "import { Menu } from '@acme/ui'\nexport const A = [Menu]\n"

type Packages = Record<string, Record<string, string>>

/**
 * `@acme/ui` as a CommonJS package whose `index.js` is `index`, over `cn.js` and `menu.js`
 * written as modules (the bundler reads either), with `more` beside them.
 */
function ui(index: string, more: Record<string, string> = {}): Packages {
  return {
    '@acme/ui': {
      'package.json': MANIFEST,
      'index.js': index,
      'cn.js': CN_ESM,
      'menu.js': MENU_ESM,
      ...more,
    },
    tslib: TSLIB,
  }
}

/**
 * What TypeScript writes as CommonJS for `source`.
 */
function compiled(
  source: string,
  options: { esModuleInterop?: boolean; importHelpers?: boolean } = {},
): string {
  return transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, ...options },
  }).outputText
}

function linesOf(error: string | undefined): string[] {
  return error === undefined ? [] : error.split('\n')
}

/**
 * The line a held take prints, or `undefined`.
 */
function heldLineOf(error: string | undefined): string | undefined {
  return linesOf(error).find((line) => line.includes(' uses cx in '))
}

const STAR = "export * from './cn'\nexport { Menu } from './menu'\n"
const NAMED = "export { cn } from './cn'\nexport { Menu } from './menu'\n"

describe('AC-used-atoms-52 - rows 38 and 39: a barrel TypeScript builds to CommonJS', () => {
  const builds = [
    ['export *', STAR, false],
    ['export *', STAR, true],
    ['export { cn }', NAMED, false],
    ['export { cn }', NAMED, true],
  ] as const

  it.each(builds)(
    'row 38: %s, importHelpers %s: the application taking cn fails with the take line',
    async (_, source, importHelpers) => {
      const packages = ui(compiled(source, { importHelpers }))
      const built = await run(APP_CN, packages, { keepFor: KEEP_FLEX })

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (cn)'))
      expect(built.error).not.toMatch(/cxModules: \[/)
      expect(heldLineOf(built.error)).toBeUndefined()
      const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
    },
  )

  it.each(builds)(
    'row 39: %s, importHelpers %s: the application taking only Menu is green, with no plugin message',
    async (_, source, importHelpers) => {
      const built = await run(ONLY_MENU, ui(compiled(source, { importHelpers })), {
        keepFor: KEEP_FLEX,
      })

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    },
  )

  it('cannot be built by Vite when the module that re-exports cx is itself compiled to CommonJS: Nave’s cx has no require condition', async () => {
    const packages = ui(compiled(STAR), {
      'cn.js': compiled("export { cx as cn } from '@navecss/core/cx'\n"),
    })
    const built = await run(APP_CN, packages, { keepFor: KEEP_FLEX })

    expect(built.error).toContain('is not exported under the conditions')
    expect(built.error).not.toContain(' uses cx in ')
  })
})

/**
 * What each emitter wrote for the barrel (`export * from './cn'` and `export { cn } from './cn'`,
 * each with `export { Menu } from './menu'`): Babel 7.29.7 with
 * `@babel/plugin-transform-modules-commonjs`, esbuild 0.28.2 with `format: 'cjs'`, and Rollup
 * 4.64.7 with `output.format: 'cjs'`.
 */
const BABEL_STAR = `"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  Menu: true
};
Object.defineProperty(exports, "Menu", {
  enumerable: true,
  get: function () {
    return _menu.Menu;
  }
});
var _cn = require("./cn");
Object.keys(_cn).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _cn[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _cn[key];
    }
  });
});
var _menu = require("./menu");
`
const BABEL_NAMED = `"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "Menu", {
  enumerable: true,
  get: function () {
    return _menu.Menu;
  }
});
Object.defineProperty(exports, "cn", {
  enumerable: true,
  get: function () {
    return _cn.cn;
  }
});
var _cn = require("./cn");
var _menu = require("./menu");
`
const ESBUILD_HELPERS = `var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
`
const ESBUILD_STAR = `${ESBUILD_HELPERS}var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  Menu: () => import_menu.Menu
});
module.exports = __toCommonJS(stdin_exports);
__reExport(stdin_exports, require("./cn"), module.exports);
var import_menu = require("./menu");
`
const ESBUILD_NAMED = `${ESBUILD_HELPERS}var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  Menu: () => import_menu.Menu,
  cn: () => import_cn.cn
});
module.exports = __toCommonJS(stdin_exports);
var import_cn = require("./cn");
var import_menu = require("./menu");
`
const ROLLUP_STAR = `'use strict';

var cn_js = require('./cn.js');
var menu_js = require('./menu.js');



Object.defineProperty(exports, "Menu", {
	enumerable: true,
	get: function () { return menu_js.Menu; }
});
Object.keys(cn_js).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return cn_js[k]; }
	});
});
`
const ROLLUP_NAMED = `'use strict';

var cn_js = require('./cn.js');
var menu_js = require('./menu.js');



Object.defineProperty(exports, "cn", {
	enumerable: true,
	get: function () { return cn_js.cn; }
});
Object.defineProperty(exports, "Menu", {
	enumerable: true,
	get: function () { return menu_js.Menu; }
});
`

/**
 * Each emitter's barrel that the build reads as a forward: the application taking cn is failed
 * through by the take line, and the one taking only Menu builds green.
 */
const FORWARDS: readonly (readonly [string, string, string])[] = [
  ['Babel', 'export { cn }', BABEL_NAMED],
  ['Rollup', 'export { cn }', ROLLUP_NAMED],
]

/**
 * Each emitter's barrel that the build cannot follow: it fails whatever the application imports.
 */
const HELD: readonly (readonly [string, string, string])[] = [
  ['Babel', 'export *', BABEL_STAR],
  ['esbuild', 'export *', ESBUILD_STAR],
  ['esbuild', 'export { cn }', ESBUILD_NAMED],
  ['Rollup', 'export *', ROLLUP_STAR],
]

describe('AC-used-atoms-52 - row 40: the barrel built to CommonJS by Babel, esbuild and Rollup', () => {
  it.each(FORWARDS)(
    '%s, %s is read as a forward: the application taking cn fails with the take line',
    async (_, __, barrel) => {
      const built = await run(APP_CN, ui(barrel), { keepFor: KEEP_FLEX })

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (cn)'))
      expect(built.error).not.toContain('keepFor: {')
      expect(built.error).not.toMatch(/cxModules: \[/)
    },
  )

  it.each(FORWARDS)(
    '%s, %s is read as a forward: the application taking only Menu is green',
    async (_, __, barrel) => {
      const built = await run(ONLY_MENU, ui(barrel), { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
    },
  )

  it.each(HELD)(
    '%s, %s fails closed: the application taking cn fails with the line for a form it cannot follow',
    async (_, __, barrel) => {
      const built = await run(APP_CN, ui(barrel), { keepFor: KEEP_FLEX })

      expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/index.js')
      expect(built.error).not.toContain('keepFor: {')
      expect(built.error).not.toMatch(/cxModules: \[/)
    },
  )

  it.each(HELD)(
    '%s, %s fails closed: the application taking only Menu fails with the same line',
    async (_, __, barrel) => {
      const built = await run(ONLY_MENU, ui(barrel), { keepFor: KEEP_FLEX })

      expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/index.js')
      expect(built.error).not.toContain("atomic: 'all'")
    },
  )
})

describe('AC-used-atoms-52 - row 38: a barrel TypeScript builds with a getter for a name it also calls', () => {
  it('stays held: the getter reads cn from the module it requires, and the build does not follow it', async () => {
    const index = compiled(
      "import { cn } from './cn'\nexport { cn }\ncn('flex')\nexport { Menu } from './menu'\n",
    )
    const built = await run(ONLY_MENU, ui(index), { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/index.js')
  })
})

describe('AC-used-atoms-52 - row 41: a CommonJS take the build cannot follow', () => {
  const ASSIGN = "module.exports = Object.assign({}, require('./cn.js'), require('./menu.js'))\n"

  it('fails, whatever the application imports, with the line for a form it cannot follow', async () => {
    const built = await run(ONLY_MENU, ui(ASSIGN), { keepFor: KEEP_FLEX })
    const line = heldLineOf(built.error)

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(line).toContain('node_modules/@acme/ui/index.js')
    expect(line).toContain('requires ./cn.js')
    expect(line).toContain('the keepFor entry does not stand in for that')
    expect(line).toContain('patched copy')
    expect(line).toContain('Which atoms the build ships')
    expect(built.error).not.toContain('keepFor: {')
    expect(built.error).not.toMatch(/cxModules: \[/)
    expect(built.error).not.toContain("atomic: 'all'")
  })

  it('is green with atomic: all set', async () => {
    const built = await run(ONLY_MENU, ui(ASSIGN), { keepFor: KEEP_FLEX, atomic: 'all' })

    expect(built.error).toBeUndefined()
  })

  it('fails the same for exports.ns = __importStar(require(...)) that TypeScript writes for a namespace export', async () => {
    const index = compiled(
      "import * as ns from './cn'\nexport { ns }\nexport { Menu } from './menu'\n",
      { esModuleInterop: true },
    )
    const built = await run(ONLY_MENU, ui(index), { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/index.js')
  })

  it('is green, with no plugin message, when menu.js takes cn and only calls it', async () => {
    const packages = ui("exports.Menu = require('./menu.js').Menu\n", {
      'menu.js': "const { cn } = require('./cn.js')\nexports.Menu = (v) => cn('flex', v)\n",
    })
    const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(built.warnings).toEqual([])
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it.each([
    [
      'a named import',
      "import { cn } from './cn'\nexport const Menu = (v: string) => cn('flex', v)\n",
      {},
    ],
    [
      'a namespace import',
      "import * as ns from './cn'\nexport const Menu = (v: string) => ns.cn('flex', v)\n",
      { esModuleInterop: true },
    ],
  ])(
    'is green when TypeScript builds menu.js from %s that only calls cn',
    async (_, source, options) => {
      const packages = ui("exports.Menu = require('./menu.js').Menu\n", {
        'menu.js': compiled(source, options),
      })
      const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
    },
  )

  it.each([
    ['a result stored on exports', "const m = require('./cn.js')\nexports.stored = m\n"],
    [
      'a destructured name that is passed on',
      "const { cn } = require('./cn.js')\nexports.f = [1].map(cn)\n",
    ],
    [
      'a call result of the module required',
      "const m = require('./cn.js')\nexports.f = register(m)\nfunction register(x) { return x }\n",
    ],
    [
      'a member that returns the module, valueOf, called',
      "const m = require('./cn.js')\nexports.ns = m.valueOf()\n",
    ],
    [
      'valueOf taken as a name and called',
      "const v = require('./cn.js').valueOf\nexports.ns = v()\n",
    ],
    [
      'valueOf destructured and called',
      "const { valueOf } = require('./cn.js')\nexports.ns = valueOf()\n",
    ],
    [
      'a member called by a computed key',
      "const m = require('./cn.js')\nexports.ns = m[globalThis.k]()\n",
    ],
    [
      'a result handed out before a var declares its name again',
      "var m = require('./cn.js')\nexports.stored = m\nvar m = 1\n",
    ],
  ])('fails for %s', async (_, text) => {
    const packages = ui("exports.Menu = require('./menu.js').Menu\n", { 'menu.js': text })
    const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/menu.js')
  })
})

describe('AC-used-atoms-52 - row 41: a CommonJS take read as calls only', () => {
  it.each([
    [
      'a member bound to a name',
      "const cn = require('./cn.js').cn\nexports.Menu = (v) => cn('flex', v)\n",
    ],
    [
      'a module called through a member',
      "const m = require('./cn.js')\nexports.Menu = (v) => m.cn('flex', v)\n",
    ],
    [
      'a destructured name, beside a parameter of the same name used as a value',
      "const { cn } = require('./cn.js')\nexports.Menu = (v) => cn('flex', v)\nexports.g = function (cn) { return [cn] }\n",
    ],
  ])('is green when menu.js takes %s and only calls it', async (_, text) => {
    const packages = ui("exports.Menu = require('./menu.js').Menu\n", { 'menu.js': text })
    const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(built.warnings).toEqual([])
  })
})

describe('AC-used-atoms-52 - a dependency’s import the build cannot follow', () => {
  it.each([
    [
      'a namespace passed on',
      "import * as ns from '@acme/ui/cn.js'\nexport const all = register(ns)\nfunction register(x) { return x }\n",
    ],
    ['a name stored', "import { cn } from '@acme/ui/cn.js'\nexport const table = { cn }\n"],
    [
      'a name passed as a value',
      "import { cn } from '@acme/ui/cn.js'\nexport const all = [1].map(cn)\n",
    ],
    [
      'names exported from a dynamic import',
      "export const { cn } = await import('@acme/ui/cn.js')\n",
    ],
    [
      'a member exported from a dynamic import',
      "export const cn = (await import('@acme/ui/cn.js')).cn\n",
    ],
  ])('fails for %s, whatever the application imports', async (_, text) => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { Menu } from './menu.js'\n",
        'menu.js': MENU_ESM,
        'cn.js': CN_ESM,
        'other.js': text,
      },
    }
    const withOther = {
      '@acme/ui': {
        ...packages['@acme/ui'],
        'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
      },
    }
    const built = await run(ONLY_MENU, withOther, { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/other.js')
  })

  it('is green when the dependency imports cx and only calls it', async () => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
        'menu.js': MENU_ESM,
        'cn.js': CN_ESM,
        'other.js': "import { cn } from './cn.js'\nexport const other = (v) => cn('flex', v)\n",
      },
    }
    const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(built.warnings).toEqual([])
  })
})

/**
 * `@acme/ui` whose barrel re-exports `other.js`, written as `text`, beside the modules that give out
 * `cx`.
 */
function withOther(text: string): Packages {
  return {
    '@acme/ui': {
      'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
      'menu.js': MENU_ESM,
      'cn.js': CN_ESM,
      'other.js': text,
    },
  }
}

describe('AC-used-atoms-52 - a dependency’s namespace import whose cx member it carries on', () => {
  const APP_TABLE =
    "import { Menu, table } from '@acme/ui'\nexport const A = [Menu, table.cn('block')]\n"
  const NS = "import * as ns from './cn.js'\n"
  const carried = [
    ['a member stored in an object', `${NS}export const table = { cn: ns.cn }\n`],
    ['a member exported', `${NS}export const c = ns.cn\n`],
    [
      'a destructured name passed as a value',
      `${NS}const { cn } = ns\nexport const all = [1].map(cn)\n`,
    ],
    ['an inherited member', `${NS}export const t = ns.valueOf()\n`],
  ] as const

  it.each(carried)('fails for %s, whatever the application imports', async (_, text) => {
    const built = await run(ONLY_MENU, withOther(text), { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/other.js')
  })

  it('fails when the application calls through the stored member', async () => {
    const text = `${NS}export const table = { cn: ns.cn }\n`
    const built = await run(APP_TABLE, withOther(text), { keepFor: KEEP_FLEX })

    expect(heldLineOf(built.error)).toContain('node_modules/@acme/ui/other.js')
  })

  it('is green when the dependency calls the member of the namespace', async () => {
    const text = `${NS}export const other = (v) => ns.cn('flex', v)\n`
    const built = await run(ONLY_MENU, withOther(text), { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(built.warnings).toEqual([])
  })
})
