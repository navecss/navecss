/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-52, a dependency module that hands Nave's `cx` out
 * without calling it, and the takes a dependency makes of a module that gives `cx` out, on the
 * plugin run over core's own `atomic.css`. The application is `components/App.ts`, imported by the
 * page. A hand-out the build reads to its export is judged by who takes that export; every other
 * one in a listed package stays an error whatever the application imports, and `keepFor` never
 * clears it. There is no `atomic: 'all'` option here, so no line may offer one.
 */
import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../../src/options.ts'
import type { Read } from '../helpers/used-atoms-fixture.ts'

import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { dependency, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'
import { IMPORT } from '../helpers/used-atoms-rows.ts'

registerIsolation()
const { read } = useUsedAtoms()

const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
const KEEP_NONE = { '@acme/ui': [] } as const
const INDEX = "export { Menu } from './menu.js'\n"
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const APP_CN = "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n"
const APP_DEFAULT = "import cn from '@acme/ui/cn.js'\nexport const A = cn('block')\n"
const ONLY_MENU = "import { Menu } from '@acme/ui'\nexport const A = [Menu]\n"
const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"

type Packages = Record<string, Record<string, string>>

/**
 * Reads an application of `code` over `packages`, each written as a dependency that lists core.
 */
function run(
  code: string,
  packages: Packages,
  options: NaveOptions = {},
  extra: Record<string, unknown> = {},
): Promise<Read> {
  const installed = Object.fromEntries(
    Object.entries(packages).map(([name, files]) => [name, dependency(name, files, extra)]),
  )
  return read({
    modules: { 'components/App.ts': code },
    packages: installed,
    importsPackages: false,
    options,
  })
}

/**
 * `@acme/ui` with `text` as its `cn.js`, whose entry also imports `cn.js` for its effect when
 * `isReached` is set, so the module is in the build whatever the application takes.
 */
function acme(text: string, isReached = false): Packages {
  return {
    '@acme/ui': {
      'index.js': `${isReached ? "import './cn.js'\n" : ''}${INDEX}`,
      'menu.js': MENU_JS,
      'cn.js': text,
      'obj.js': 'export default {}\n',
    },
  }
}

/**
 * The remedy line that opens with `@acme/ui`, which the report prints for the package.
 */
function packageLines(outcome: Read): string[] {
  return outcome.remedies.filter((line) => line.startsWith('@acme/ui'))
}

const HAND_OUTS: readonly (readonly [string, string, string, string])[] = [
  ['export const cn = cx', `${IMPORT}export const cn = cx\n`, APP_CN, 'cn'],
  ['const cn = cx; export { cn }', `${IMPORT}const cn = cx\nexport { cn }\n`, APP_CN, 'cn'],
  [
    'const cn = cx; export default cn',
    `${IMPORT}const cn = cx\nexport default cn\n`,
    APP_DEFAULT,
    'the default export',
  ],
]

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a hand-out of cx the build reads to its export', () => {
  describe('row 27: listed', () => {
    it.each(HAND_OUTS)('%s fails the application that takes it', async (_, text, app, name) => {
      for (const keepFor of [KEEP_FLEX, KEEP_NONE]) {
        const outcome = await run(app, acme(text), { keepFor })

        expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
        expect(outcome.problems[0]).toMatch(/^node_modules\/@acme\/ui\/cn\.js:/u)
        expect(outcome.text).toContain('your code takes that cx')
        expect(outcome.text).toContain(`components/App.ts (${name})`)
        expect(outcome.text).not.toMatch(/cxModules: \[/u)
      }
    })

    it.each(HAND_OUTS)('%s builds green once the application calls Nave’s cx', async (_, text) => {
      const outcome = await run(NAVE_APP, acme(text), { keepFor: KEEP_FLEX })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['block', 'flex'])
    })
  })

  describe('row 28: not listed', () => {
    it.each(HAND_OUTS)(
      '%s carries the import clause beside the keepFor line',
      async (_, text, app) => {
        const outcome = await run(app, acme(text))
        const line = outcome.remedies.find((one) => one.includes('is a dependency'))

        expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
        expect(line).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
        expect(line).toContain('@acme/ui also gives cx out under another name')
        expect(line).toContain('import cx from @navecss/core/cx instead and call cx in its place')
      },
    )

    it.each(HAND_OUTS)(
      '%s, with only the keepFor line pasted, fails as row 27 does',
      async (_, text, app) => {
        const pasted = await run(app, acme(text), { keepFor: KEEP_FLEX })

        expect(pasted.text).toContain('your code takes that cx')
      },
    )
  })

  describe('rows 29 and 30', () => {
    it('is green, with no report, when the application takes only Menu from an entry that also holds export const cn = cx', async () => {
      const packages = {
        '@acme/ui': {
          'index.js': `${IMPORT}export { Menu } from './menu.js'\nexport const cn = cx\n`,
          'menu.js': MENU_JS,
        },
      }
      const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
    })

    it('keeps the wrapper the stated residual: green, and the list names what ships', async () => {
      const wrapper = acme(`${IMPORT}export const cn = (...a) => cx(...a)\n`)
      const listed = await run(APP_CN, wrapper, { keepFor: KEEP_FLEX })
      const both = await run(APP_CN, wrapper, { keepFor: { '@acme/ui': ['flex', 'block'] } })

      expect(listed.report).toBeUndefined()
      expect(listed.atoms).toEqual(['flex'])
      expect(both.atoms).toEqual(['block', 'flex'])
    })
  })

  describe('row 31: a dependency forwards a cx export through an alias', () => {
    const packages = {
      '@acme/ui': { 'index.js': INDEX, 'menu.js': MENU_JS, 'f.js': CN },
      '@other/ui': {
        'index.js': "import { cn } from '@acme/ui/f.js'\nconst k = cn\nexport { k }\n",
      },
    }

    it('fails with the take line naming the application file and k, and is green once cx comes from Nave', async () => {
      const failed = await run(
        "import { k } from '@other/ui'\nexport const A = k('block')\n",
        packages,
        { keepFor: KEEP_FLEX },
      )
      const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(failed.text).toContain('components/App.ts (k)')
      expect(failed.text).not.toMatch(/cxModules: \[/u)
      expect(followed.report).toBeUndefined()
      expect(followed.atoms).toEqual(['block', 'flex'])
    })
  })
})

const UNBOUND: readonly (readonly [string, string, string])[] = [
  [
    'obj.cn = cx, obj imported',
    `${IMPORT}import obj from './obj.js'\nobj.cn = cx\nexport { obj }\n`,
    "import { obj } from '@acme/ui/cn.js'\nexport const A = obj.cn('block')\n",
  ],
  [
    'memo(cx)',
    `${IMPORT}const memo = (f) => f\nexport const m = memo(cx)\n`,
    "import { m } from '@acme/ui/cn.js'\nexport const A = m('block')\n",
  ],
  [
    '{ cn: cx }',
    `${IMPORT}export const ui = { cn: cx }\n`,
    "import { ui } from '@acme/ui/cn.js'\nexport const A = ui.cn('block')\n",
  ],
  ['cx.bind(null)', `${IMPORT}export const cn = cx.bind(null)\n`, APP_CN],
  [
    'cx.valueOf()',
    `${IMPORT}export const cn = cx.valueOf()\n`,
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
  [
    'const { valueOf } = cx',
    `${IMPORT}const { valueOf } = cx\nexport const cn = valueOf\n`,
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
  [
    'cx.dynamic = f, a write to a member',
    `${IMPORT}cx.dynamic = (n) => n\n`,
    "import { Menu } from '@acme/ui'\nexport const A = [Menu]\n",
  ],
  [
    'a tagged template over cx',
    `${IMPORT}export const box = {}\nconst grab = (s, v) => { box.cn = v }\ngrab\`\${cx}\`\n`,
    "import { box } from '@acme/ui/cn.js'\nexport const A = box.cn('block')\n",
  ],
  [
    'cx instanceof a class that stores its operand',
    `${IMPORT}export const box = {}\nclass G { static [Symbol.hasInstance](v) { box.cn = v; return false } }\nexport const t = cx instanceof G\n`,
    "import { box } from '@acme/ui/cn.js'\nexport const A = box.cn('block')\n",
  ],
  [
    'var cn = cx, then a var cn = 0 under a dead branch',
    `${IMPORT}var cn = cx\nexport { cn }\nif (globalThis.never) var cn = 0\n`,
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
  [
    'var cn = 0, then var cn = cx',
    `${IMPORT}var cn = 0\nvar cn = cx\nexport { cn }\n`,
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
  [
    'import(cx).then((m) => m.valueOf())',
    "export const p = import('@navecss/core/cx').then((m) => m.valueOf())\n",
    "import { p } from '@acme/ui/cn.js'\nexport const A = (await p).cx('block')\n",
  ],
  [
    'import(cx).then((m) => m[k]()), a computed key',
    "export const p = import('@navecss/core/cx').then((m) => m[globalThis.k]())\n",
    "import { p } from '@acme/ui/cn.js'\nexport const A = (await p).cx('block')\n",
  ],
  [
    'await import(cx), the import recorded by the walk',
    "const { cx } = await import('@navecss/core/cx')\nexport const cn = cx\n",
    APP_CN,
  ],
  [
    'require(cx), the import recorded by the walk',
    "const { cx } = require('@navecss/core/cx')\nexports.cn = cx\n",
    APP_CN,
  ],
  [
    'require(cx) before a var declares its name again, the import recorded by the walk',
    "var m = require('@navecss/core/cx')\nexports.cn = m.cx\nvar m = 1\n",
    APP_CN,
  ],
  [
    'import(cx).then((m) => m.cx)',
    "export const p = import('@navecss/core/cx').then((m) => m.cx)\n",
    "import { p } from '@acme/ui/cn.js'\nexport const A = (await p)('block')\n",
  ],
  [
    'export const d = import(cx)',
    "export const d = import('@navecss/core/cx')\n",
    "import { d } from '@acme/ui/cn.js'\nexport const A = (await d).cx('block')\n",
  ],
  [
    'export const m = await import(cx)',
    "export const m = await import('@navecss/core/cx')\n",
    "import { m } from '@acme/ui/cn.js'\nexport const A = m.cx('block')\n",
  ],
  [
    'export const { cx: cn } = await import(cx)',
    "export const { cx: cn } = await import('@navecss/core/cx')\n",
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
]

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a hand-out the build cannot read to an export fails closed in a listed package', () => {
  describe('row 32: the application calls through it', () => {
    it.each(UNBOUND)(
      '%s fails with the line that leads to a route the consumer can take',
      async (_, text, app) => {
        const outcome = await run(app, acme(text, true), { keepFor: KEEP_FLEX })
        const [line, ...more] = packageLines(outcome)

        expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
        expect(more).toEqual([])
        expect(line).toContain('node_modules/@acme/ui/cn.js')
        expect(line).toContain('the keepFor entry does not stand in for that')
        expect(line).toContain('export it by name')
        expect(line).toContain('whatever your code takes from @acme/ui')
        expect(line).toContain('patched copy')
        expect(line).toMatch(
          /ship every atom: see "Shipping every atom" under "Which atoms the build ships" in the @navecss\/prune README: https:\/\/github\.com\/navecss\/navecss\/tree\/main\/packages\/prune#shipping-every-atom\.$/u,
        )
        expect(line).not.toContain('@navecss/core/README.md')
        expect(outcome.text).not.toContain('keepFor: {')
        expect(outcome.text).not.toContain('cxModules: [')
        expect(outcome.text).not.toContain("atomic: 'all'")
      },
    )

    it.each(UNBOUND)('%s names the form it found', async (_, text, app) => {
      const outcome = await run(app, acme(text, true), { keepFor: KEEP_FLEX })
      const form = outcome.problems[0]!.replace(/^[^ ]+ /u, '').replace(/\.(\s.*)?$/su, '')

      expect(packageLines(outcome)[0]).toContain(`(${form})`)
    })
  })

  describe('row 33: the accepted cost, the application imports only Menu', () => {
    it.each(UNBOUND)('%s fails with the same line', async (_, text, app) => {
      const through = await run(app, acme(text, true), { keepFor: KEEP_FLEX })
      const only = await run(ONLY_MENU, acme(text, true), { keepFor: KEEP_FLEX })

      expect(only.report).toBeDefined()
      expect(packageLines(only)).toEqual(packageLines(through))
    })
  })

  describe('row 34: the controls, listed', () => {
    it('is green, with no report, for typeof cx and { ...cx }', async () => {
      const outcome = await run(
        ONLY_MENU,
        acme(`${IMPORT}export const kind = typeof cx\nexport const copy = { ...cx }\n`, true),
        { keepFor: KEEP_FLEX },
      )

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
    })

    it('gives cx as Cx and a two-step alias the result of row 27 for their exports', async () => {
      const asCx = await run(
        "import { cn } from '@acme/ui/cn.ts'\nexport const A = cn('block')\n",
        {
          '@acme/ui': {
            'index.js': INDEX,
            'menu.js': MENU_JS,
            'cn.ts': `${IMPORT}type Cx = typeof cx\nexport const cn = cx as Cx\n`,
          },
        },
        { keepFor: KEEP_FLEX },
      )
      const twoStep = await run(
        "import { b } from '@acme/ui/cn.js'\nexport const A = b('block')\n",
        acme(`${IMPORT}const a = cx\nconst b = a\nexport { b }\n`),
        { keepFor: KEEP_FLEX },
      )

      expect(asCx.text).toContain('components/App.ts (cn)')
      expect(twoStep.text).toContain('components/App.ts (b)')
    })

    it('is green when a listed package imports cx in a form the build does not bind and only calls it', async () => {
      const outcome = await run(
        ONLY_MENU,
        acme(
          "const { cx } = require('@navecss/core/cx')\nexports.f = (v) => cx('grid', v)\n",
          true,
        ),
        { keepFor: KEEP_FLEX },
      )

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['flex'])
    })

    it.each([
      [
        'a member of require(cx) bound to a name',
        "const cx = require('@navecss/core/cx').cx\nexports.f = (v) => cx('grid', v)\n",
      ],
      [
        'a then callback of import(cx), through a destructured parameter',
        "import('@navecss/core/cx').then(({ cx }) => cx('grid'))\n",
      ],
      [
        'a then callback of import(cx), through a parameter',
        "export const p = import('@navecss/core/cx').then((m) => m.cx('grid'))\n",
      ],
    ])('is green when a listed package takes cx as %s and only calls it', async (_, text) => {
      const outcome = await run(ONLY_MENU, acme(text, true), { keepFor: KEEP_FLEX })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['flex'])
    })

    it.each([
      [
        'an alias called through .call()',
        `${IMPORT}const cn = cx\nexport const Pick = (v) => cn.call(null, 'flex', v)\n`,
      ],
      [
        'raw and dynamic read from an alias',
        `${IMPORT}const cn = cx\nexport const r = cn.raw\nexport const d = cn.dynamic\n`,
      ],
      [
        'raw and dynamic destructured from an alias',
        `${IMPORT}const cn = cx\nexport const { raw, dynamic } = cn\n`,
      ],
    ])('is green, with no report, for %s', async (_, text) => {
      const outcome = await run(ONLY_MENU, acme(text, true), { keepFor: KEEP_FLEX })

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
    })

    it('stays an error, as before, for the same form when the package is not listed', async () => {
      const outcome = await run(
        ONLY_MENU,
        acme(
          "const { cx } = require('@navecss/core/cx')\nexports.f = (v) => cx('grid', v)\n",
          true,
        ),
      )

      expect(outcome.report).toBeDefined()
      expect(outcome.remedies.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(
        true,
      )
    })
  })
})

const MANIFEST = { type: 'commonjs' }
const BARREL_CN = "export { cx as cn } from '@navecss/core/cx'\n"

/**
 * `@acme/ui` as a CommonJS package with `index` as its entry, over `cn.js` and `menu.js`.
 */
function commonjs(index: string, more: Record<string, string> = {}): Packages {
  return {
    '@acme/ui': { 'index.js': index, 'cn.js': BARREL_CN, 'menu.js': MENU_JS, ...more },
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

const STAR = "export * from './cn'\nexport { Menu } from './menu'\n"
const NAMED = "export { cn } from './cn'\nexport { Menu } from './menu'\n"
const APP_BARREL = "import { cn } from '@acme/ui'\nexport const A = cn('block')\n"

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, rows 38 and 39, a barrel TypeScript builds to CommonJS', () => {
  const builds = [
    ['export *', STAR, false],
    ['export *', STAR, true],
    ['export { cn }', NAMED, false],
    ['export { cn }', NAMED, true],
  ] as const
  const tslib = {
    tslib: {
      'index.js': 'exports.__exportStar = function (m, o) { for (const p in m) o[p] = m[p] }\n',
    },
  }

  it.each(builds)(
    'row 38: %s, importHelpers %s: the application taking cn fails with the take line',
    async (_, source, importHelpers) => {
      const packages = { ...commonjs(compiled(source, { importHelpers })), ...tslib }
      const outcome = await run(APP_BARREL, packages, { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.text).toContain('components/App.ts (cn)')
      expect(outcome.text).not.toMatch(/cxModules: \[/u)
      expect(outcome.text).not.toContain(' uses cx in ')
      const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX }, MANIFEST)

      expect(followed.report).toBeUndefined()
      expect(followed.atoms).toEqual(['block', 'flex'])
    },
  )

  it.each(builds)(
    'row 39: %s, importHelpers %s: the application taking only Menu is green, with no message',
    async (_, source, importHelpers) => {
      const packages = { ...commonjs(compiled(source, { importHelpers })), ...tslib }
      const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
      expect(outcome.atoms).toEqual(['flex'])
    },
  )

  it('fails closed when the module that re-exports cx is itself compiled to CommonJS: the require of Nave’s cx is a hand-out the build does not bind', async () => {
    const packages = commonjs(compiled(STAR), { 'cn.js': compiled(BARREL_CN) })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/cn.js')
  })
})

/**
 * The CommonJS that Babel, esbuild and Rollup write for the barrel, condensed by hand from the
 * Vite rows, which keep each tool's output as it wrote it: the statements the reader keys on are
 * the same, the line breaks inside them are not.
 */
const BABEL_STAR = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _exportNames = { Menu: true };
Object.defineProperty(exports, "Menu", { enumerable: true, get: function () { return _menu.Menu; } });
var _cn = require("./cn");
Object.keys(_cn).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _cn[key]) return;
  Object.defineProperty(exports, key, { enumerable: true, get: function () { return _cn[key]; } });
});
var _menu = require("./menu");
`
const BABEL_NAMED = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, "Menu", { enumerable: true, get: function () { return _menu.Menu; } });
Object.defineProperty(exports, "cn", { enumerable: true, get: function () { return _cn.cn; } });
var _cn = require("./cn");
var _menu = require("./menu");
`
const ESBUILD_STAR = `var __defProp = Object.defineProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, { Menu: () => import_menu.Menu });
module.exports = __toCommonJS(stdin_exports);
__reExport(stdin_exports, require("./cn"), module.exports);
var import_menu = require("./menu");
`
const ESBUILD_NAMED = `var __defProp = Object.defineProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, { Menu: () => import_menu.Menu, cn: () => import_cn.cn });
module.exports = __toCommonJS(stdin_exports);
var import_cn = require("./cn");
var import_menu = require("./menu");
`
const ROLLUP_STAR = `'use strict';
var cn_js = require('./cn.js');
var menu_js = require('./menu.js');
Object.defineProperty(exports, "Menu", { enumerable: true, get: function () { return menu_js.Menu; } });
Object.keys(cn_js).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, { enumerable: true, get: function () { return cn_js[k]; } });
});
`
const ROLLUP_NAMED = `'use strict';
var cn_js = require('./cn.js');
var menu_js = require('./menu.js');
Object.defineProperty(exports, "cn", { enumerable: true, get: function () { return cn_js.cn; } });
Object.defineProperty(exports, "Menu", { enumerable: true, get: function () { return menu_js.Menu; } });
`

const FORWARDS: readonly (readonly [string, string, string])[] = [
  ['Babel', 'export { cn }', BABEL_NAMED],
  ['Rollup', 'export { cn }', ROLLUP_NAMED],
]
const HELD: readonly (readonly [string, string, string])[] = [
  ['Babel', 'export *', BABEL_STAR],
  ['esbuild', 'export *', ESBUILD_STAR],
  ['esbuild', 'export { cn }', ESBUILD_NAMED],
  ['Rollup', 'export *', ROLLUP_STAR],
]

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, row 40, the barrel built to CommonJS by Babel, esbuild and Rollup', () => {
  it.each(FORWARDS)(
    '%s, %s is read as a forward: the application taking cn fails with the take line',
    async (_, __, barrel) => {
      const outcome = await run(APP_BARREL, commonjs(barrel), { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.text).toContain('components/App.ts (cn)')
      expect(outcome.text).not.toContain('keepFor: {')
      expect(outcome.text).not.toMatch(/cxModules: \[/u)
    },
  )

  it.each(FORWARDS)(
    '%s, %s is read as a forward: the application taking only Menu is green',
    async (_, __, barrel) => {
      const outcome = await run(ONLY_MENU, commonjs(barrel), { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.report).toBeUndefined()
    },
  )

  it.each(HELD)(
    '%s, %s fails closed: the application taking cn fails with the line for a form it cannot follow',
    async (_, __, barrel) => {
      const outcome = await run(APP_BARREL, commonjs(barrel), { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/index.js')
      expect(outcome.text).not.toContain('keepFor: {')
      expect(outcome.text).not.toMatch(/cxModules: \[/u)
    },
  )

  it.each(HELD)(
    '%s, %s fails closed: the application taking only Menu fails with the same line',
    async (_, __, barrel) => {
      const outcome = await run(ONLY_MENU, commonjs(barrel), { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/index.js')
    },
  )
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, row 38, a barrel TypeScript builds with a getter for a name it also calls', () => {
  it('stays held: the getter reads cn from the module it requires, and the build does not follow it', async () => {
    const index = compiled(
      "import { cn } from './cn'\nexport { cn }\ncn('flex')\nexport { Menu } from './menu'\n",
    )
    const outcome = await run(ONLY_MENU, commonjs(index), { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/index.js')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, row 41: import x = require(...) in a listed dependency', () => {
  const entry = { 'index.js': "export { Menu } from './menu.ts'\n" }
  const REQUIRE = "import x = require('@navecss/core/cx')\n"

  it('is green, with no message, when the dependency only calls through x', async () => {
    const menu = `${REQUIRE}export const Menu = (v: string) => x.cx('flex', v)\n`
    const packages = { '@acme/ui': { ...entry, 'menu.ts': menu } }
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
  })

  it.each([
    ['stored', 'export const all = x\n'],
    ['passed on', 'export const all = [1].map(x)\n'],
    ['read for valueOf and called', 'export const all = x.valueOf()\n'],
  ])('fails when the dependency has x %s', async (_, use) => {
    const menu = `${REQUIRE}${use}export const Menu = (v: string) => x.cx('flex', v)\n`
    const packages = { '@acme/ui': { ...entry, 'menu.ts': menu } }
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/menu.ts')
  })

  it('fails when the dependency exports x', async () => {
    const menu = `${REQUIRE}export { x }\nexport const Menu = (v: string) => x.cx('flex', v)\n`
    const packages = { '@acme/ui': { ...entry, 'menu.ts': menu } }
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/menu.ts')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, row 41, a CommonJS take the build cannot follow', () => {
  const ASSIGN = "module.exports = Object.assign({}, require('./cn.js'), require('./menu.js'))\n"

  it('fails, whatever the application imports, with the line for a form it cannot follow', async () => {
    const outcome = await run(ONLY_MENU, commonjs(ASSIGN), { keepFor: KEEP_FLEX }, MANIFEST)
    const line = packageLines(outcome)[0]

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(line).toContain('node_modules/@acme/ui/index.js')
    expect(line).toContain('requires ./cn.js')
    expect(line).toContain('the keepFor entry does not stand in for that')
    expect(line).toContain('Which atoms the build ships')
    expect(outcome.text).not.toContain('keepFor: {')
    expect(outcome.text).not.toMatch(/cxModules: \[/u)
    expect(outcome.text).not.toContain("atomic: 'all'")
  })

  it('fails the same for exports.ns = __importStar(require(...)) that TypeScript writes for a namespace export', async () => {
    const index = compiled(
      "import * as ns from './cn'\nexport { ns }\nexport { Menu } from './menu'\n",
      { esModuleInterop: true },
    )
    const outcome = await run(ONLY_MENU, commonjs(index), { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/index.js')
  })

  it('is green, with no message, when menu.js takes cn and only calls it', async () => {
    const packages = commonjs("exports.Menu = require('./menu.js').Menu\n", {
      'menu.js': "const { cn } = require('./cn.js')\nexports.Menu = (v) => cn('flex', v)\n",
    })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
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
      const packages = commonjs("exports.Menu = require('./menu.js').Menu\n", {
        'menu.js': compiled(source, options),
      })
      const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

      expect(outcome.report).toBeUndefined()
    },
  )

  it.each([
    ['a result stored on exports', "const m = require('./cn.js')\nexports.stored = m\n"],
    [
      'a destructured name that is passed on',
      "const { cn } = require('./cn.js')\nexports.f = [1].map(cn)\n",
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
      'valueOf of the required Nave cx, called',
      "const m = require('@navecss/core/cx')\nexports.ns = m.valueOf()\n",
    ],
    [
      'a result handed out before a var declares its name again',
      "var m = require('./cn.js')\nexports.stored = m\nvar m = 1\n",
    ],
  ])('fails for %s', async (_, text) => {
    const packages = commonjs("exports.Menu = require('./menu.js').Menu\n", { 'menu.js': text })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/menu.js')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, row 41: a CommonJS take read as calls only', () => {
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
    const packages = commonjs("exports.Menu = require('./menu.js').Menu\n", { 'menu.js': text })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.report).toBeUndefined()
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a dependency’s import the build cannot follow', () => {
  it.each([
    [
      'a namespace passed on',
      "import * as ns from './cn.js'\nexport const all = register(ns)\nfunction register(x) { return x }\n",
    ],
    ['a name stored', "import { cn } from './cn.js'\nexport const table = { cn }\n"],
    ['a name passed as a value', "import { cn } from './cn.js'\nexport const all = [1].map(cn)\n"],
    ['names exported from a dynamic import', "export const { cn } = await import('./cn.js')\n"],
    ['a member exported from a dynamic import', "export const cn = (await import('./cn.js')).cn\n"],
  ])('fails for %s, whatever the application imports', async (_, text) => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
        'menu.js': MENU_JS,
        'cn.js': CN,
        'other.js': text,
      },
    }
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.js')
  })

  it('is green when the dependency imports cx and only calls it', async () => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
        'menu.js': MENU_JS,
        'cn.js': CN,
        'other.js': "import { cn } from './cn.js'\nexport const other = (v) => cn('flex', v)\n",
      },
    }
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

    expect(outcome.report).toBeUndefined()
  })
})

/**
 * `@acme/ui` whose barrel re-exports `other.js`, written as `text`, beside the modules that give out
 * `cx`.
 */
function withOther(text: string, cn = CN): Packages {
  return {
    '@acme/ui': {
      'index.js': "export { Menu } from './menu.js'\nexport * from './other.js'\n",
      'menu.js': MENU_JS,
      'cn.js': cn,
      'other.js': text,
    },
  }
}

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a dependency’s namespace import whose cx member it carries on', () => {
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
    const outcome = await run(ONLY_MENU, withOther(text), { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.js')
  })

  it('fails when the application calls through the stored member', async () => {
    const text = `${NS}export const table = { cn: ns.cn }\n`
    const outcome = await run(APP_TABLE, withOther(text), { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.js')
  })

  it('is green when the dependency calls the member of the namespace', async () => {
    const text = `${NS}export const other = (v) => ns.cn('flex', v)\n`
    const outcome = await run(ONLY_MENU, withOther(text), { keepFor: KEEP_FLEX })

    expect(outcome.report).toBeUndefined()
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a dependency that calls a member of the module giving out cx with the module as its receiver', () => {
  const NS = "import * as ns from './cn.js'\n"
  const CN_SELF = `${CN}export function self() { return this }\n`
  const received = [
    ['ns.self()', `${NS}export const t = ns.self()\n`],
    ['ns.self?.()', `${NS}export const t = ns.self?.()\n`],
    ['(ns.self)()', `${NS}export const t = (ns.self)()\n`],
    ['a tagged template ns.self`x`', `${NS}export const t = ns.self\`x\`\n`],
    ['a computed key, ns[k]()', `${NS}export const t = ns[globalThis.k]()\n`],
    ['(ns?.self)()', `${NS}export const t = (ns?.self)()\n`],
    ['(ns?.self)?.()', `${NS}export const t = (ns?.self)?.()\n`],
  ] as const

  it.each(received)('fails for %s, whatever the application imports', async (_, text) => {
    const outcome = await run(ONLY_MENU, withOther(text, CN_SELF), { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.js')
  })

  it.each([
    ['a cx member called, ns.cn()', `${NS}export const other = (v) => ns.cn('flex', v)\n`],
    ['a call through a sequence, (0, ns.self)()', `${NS}export const t = (0, ns.self)()\n`],
    ['a destructured name called', `${NS}const { self } = ns\nexport const t = self()\n`],
  ])('is green for %s', async (_, text) => {
    const outcome = await run(ONLY_MENU, withOther(text, CN_SELF), { keepFor: KEEP_FLEX })

    expect(outcome.report).toBeUndefined()
  })

  const MENU = "exports.Menu = require('./menu.js').Menu\n"
  const REQUIRED = `${MENU}const m = require('./cn.js')\n`

  it.each([
    ['m.self() on a require result', 'exports.t = m.self()\n'],
    ['m.self?.() on a require result', 'exports.t = m.self?.()\n'],
    ['m[k]() on a require result', 'exports.t = m[globalThis.k]()\n'],
  ])('fails for %s, whatever the application imports', async (_, text) => {
    const packages = commonjs(`${REQUIRED}${text}`, { 'cn.js': CN_SELF })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/index.js')
  })

  it.each([
    ['m.cn() on a require result', "exports.f = (v) => m.cn('flex', v)\n"],
    ['(0, m.self)() on a require result', 'exports.t = (0, m.self)()\n'],
    ['a destructured name called', "const { self } = require('./cn.js')\nexports.t = self()\n"],
  ])('is green for %s', async (_, text) => {
    const packages = commonjs(`${text.startsWith('const {') ? MENU : REQUIRED}${text}`, {
      'cn.js': CN_SELF,
    })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.report).toBeUndefined()
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a TypeScript dependency calling a member of the module giving out cx through a type assertion', () => {
  const NS = "import * as ns from './cn.js'\n"
  const CN_SELF = `${CN}export function self() { return this }\n`
  const wrapped = [
    ['ns.self!()', `${NS}export const t = ns.self!()\n`],
    ['(ns.self as () => unknown)()', `${NS}export const t = (ns.self as () => unknown)()\n`],
    [
      '(ns.self satisfies () => unknown)()',
      `${NS}export const t = (ns.self satisfies () => unknown)()\n`,
    ],
    ['ns.self!?.()', `${NS}export const t = ns.self!?.()\n`],
  ] as const

  function withTs(text: string): Packages {
    const packages = withOther('', CN_SELF)
    const files = { ...packages['@acme/ui']!, 'other.ts': text }
    delete (files as Record<string, string>)['other.js']
    return {
      '@acme/ui': {
        ...files,
        'index.js': "export { Menu } from './menu.js'\nexport * from './other.ts'\n",
      },
    }
  }

  it.each(wrapped)('fails for %s, whatever the application imports', async (_, text) => {
    const outcome = await run(ONLY_MENU, withTs(text), { keepFor: KEEP_FLEX })

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.ts')
  })

  it('is green for ns.cn!(), a call of a cx member', async () => {
    const outcome = await run(ONLY_MENU, withTs(`${NS}export const t = ns.cn!('flex')\n`), {
      keepFor: KEEP_FLEX,
    })

    expect(outcome.report).toBeUndefined()
  })

  it('fails for m.self!() on a require result', async () => {
    const index = "exports.Menu = require('./menu.js').Menu\nexports.o = require('./other.ts')\n"
    const other = "const m = require('./cn.js')\nexports.t = m.self!()\n"
    const packages = commonjs(index, { 'cn.js': CN_SELF, 'other.ts': other })
    const outcome = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX }, MANIFEST)

    expect(outcome.text).toContain('uses cx in node_modules/@acme/ui/other.ts')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a dependency that imports a declared cxModules module dynamically and calls a member of it that is not cx', () => {
  const DECLARED = "export { cx } from '@navecss/core/cx'\nexport function self() { return this }\n"
  const FORMS = [
    ['.then((m) => m.self())', "export const p = import('@acme/ui/cn.js').then((m) => m.self())\n"],
    [
      '.then((m) => (m?.self)())',
      "export const p = import('@acme/ui/cn.js').then((m) => (m?.self)())\n",
    ],
  ] as const

  it.each(FORMS)('fails for %s, whatever the application imports', async (_, text) => {
    const packages = withOther(text, DECLARED)
    const outcome = await run(ONLY_MENU, packages, {
      keepFor: KEEP_FLEX,
      cxModules: ['@acme/ui/cn.js'],
    })

    expect(outcome.text).toContain('node_modules/@acme/ui/other.js')
  })

  it('is green for .then((m) => m.cx(...)), a call of the cx export', async () => {
    const text = "export const p = import('@acme/ui/cn.js').then((m) => m.cx('flex'))\n"
    const outcome = await run(ONLY_MENU, withOther(text, DECLARED), {
      keepFor: KEEP_FLEX,
      cxModules: ['@acme/ui/cn.js'],
    })

    expect(outcome.report).toBeUndefined()
  })
})
