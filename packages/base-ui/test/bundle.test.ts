import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import { DIST_DIR } from './support/dist.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { COMPLETION_SUBPATHS, SINGLE_COMPONENT, topName } from './support/subpaths.ts'
import { tableP } from './support/table-p.ts'

const WORK = path.join(PACKAGE_DIR, 'node_modules/.cache/bundle-tests')

/**
 * A consumer entry bundled by rolldown, minified, with React left external: the bundle's code and
 * the warnings the bundler gave. `dist` is the built package `@navecss/base-ui` resolves to, and
 * `baseUi` is what `@base-ui/react` resolves to (the installed version unless a run names another).
 */
const bundleOf = async (
  name: string,
  source: string,
  dist: string = DIST_DIR,
  baseUi?: string,
): Promise<{ code: string; warnings: string[] }> => {
  mkdirSync(WORK, { recursive: true })
  const entry = path.join(WORK, `${name}.js`)
  writeFileSync(entry, source)
  const warnings: string[] = []
  const bundle = await rolldown({
    external: /^react(?:-dom)?(?:\/|$)/,
    input: entry,
    logLevel: 'warn',
    onLog: (level, log) => {
      if (level === 'warn') {
        warnings.push(`${log.code ?? 'WARNING'}: ${stripVTControlCharacters(log.message)}`)
      }
    },
    resolve: {
      alias: {
        '@navecss/base-ui': dist,
        ...(baseUi !== undefined && { '@base-ui/react': baseUi }),
      },
    },
  })
  const { output } = await bundle.generate({ format: 'esm', minify: true })
  return { code: output[0].code, warnings }
}

/**
 * The minified size of a consumer entry bundled by rolldown, with React left external.
 */
const sizeOf = async (name: string, source: string, dist: string = DIST_DIR): Promise<number> => {
  const { code } = await bundleOf(name, source, dist)
  return code.length
}

const entry = (specifier: string, top: string, parts: readonly string[]): string =>
  `import { ${top} } from '${specifier}'\nconsole.log(${parts.map((part) => `${top}.${part}`).join(', ')})\n`

/**
 * An entry for `Menubar`, which is one component with no parts: it is used with a menu's trigger,
 * and `extra` names more parts of `Menu`.
 */
const menubarEntry = (specifier: string, extra: readonly string[]): string =>
  `import { Menubar } from '${specifier}/menubar'\nimport { Menu } from '${specifier}/menu'\n` +
  `console.log(${['Menubar', 'Menu.Trigger', ...extra.map((part) => `Menu.${part}`)].join(', ')})\n`

/**
 * What the wrapper helper costs a bundle on its own: the built `part.js`, minified, with React
 * external. Any wrapped part pays it once.
 */
const helperCost = (dist: string, name: string): Promise<number> =>
  sizeOf(
    `${name}-helper`,
    `import { wrapPart } from '${path.join(dist, 'part.js')}'\nconsole.log(wrapPart)\n`,
    dist,
  )

// The helper is the wrapper's one fixed cost, and the other bounds are measured against it, so it
// is held to a ceiling of its own.
const HELPER_CEILING = 1024

// What the used, wrapped part may add besides the helper: its call and its class string.
const SLACK = 120

/**
 * What a component is measured with: the parts outside its pair, and the consumer entry that uses
 * its pair and, besides, some more parts, from Base UI (`bare`) or from this package (`wrapped`).
 */
interface Subject {
  readonly entry: (side: 'bare' | 'wrapped', extra: readonly string[]) => string
  readonly label: string
  readonly others: readonly string[]
}

/**
 * The subject of a component with a namespace of parts: its pair is its Root plus its Popup (or,
 * without one, its first styled part), and every other part of its namespace is left unused.
 */
const subjectOf = async (subpath: string): Promise<Subject | undefined> => {
  const top = topName(subpath)
  const keys = Object.keys(
    ((await import(/* @vite-ignore */ `@base-ui/react/${subpath}`)) as Record<string, object>)[
      top
    ] ?? {},
  )
  const styled = keys.includes('Popup')
    ? 'Popup'
    : keys.find((key) => key !== 'Root' && tableP.has(`${top}.${key}`))
  if (styled === undefined || !keys.includes('Root')) {
    return undefined
  }
  const pair = ['Root', styled]
  return {
    entry: (side, extra) =>
      entry(side === 'bare' ? `@base-ui/react/${subpath}` : `@navecss/base-ui/${subpath}`, top, [
        ...pair,
        ...extra,
      ]),
    label: subpath,
    others: keys.filter((key) => !pair.includes(key)),
  }
}

/**
 * The subject of `Menubar`: its pair is `Menubar` and `Menu.Trigger`, and the other parts of `Menu`
 * are left unused.
 */
const menubarSubject = async (): Promise<Subject> => {
  const menu = ((await import('@base-ui/react/menu')) as { Menu: Record<string, unknown> }).Menu
  return {
    entry: (side, extra) =>
      menubarEntry(side === 'bare' ? '@base-ui/react' : '@navecss/base-ui', extra),
    label: 'menubar',
    others: Object.keys(menu).filter((key) => key !== 'Trigger'),
  }
}

/**
 * Where a component's wrapper breaks the bound, by the clause it breaks. With (a) the pair from
 * Base UI, (b) as (a) plus one more part P, (c) the pair from the wrapper and (d) as (c) plus P:
 * the second clause is that (c) costs no more than the helper and the used parts' own calls over
 * (a); the third is that, for every P, (d) adds at least half of what (b) adds, which compares the
 * wrapper with itself, so the helper's cost cancels and a small part is checked as well as a
 * large one.
 */
const bundleProblems = async (
  subject: Subject | undefined,
  helper: number,
  dist: string,
  name: string,
): Promise<{ second: string[]; third: string[] }> => {
  if (subject === undefined) {
    return { second: [`${name}: no Root and styled part to measure`], third: [] }
  }
  const { label, others } = subject
  const a = await sizeOf(`${name}-a`, subject.entry('bare', []), dist)
  const c = await sizeOf(`${name}-c`, subject.entry('wrapped', []), dist)
  const second =
    c - a > helper + SLACK ? [`${label}: c-a ${c - a} > helper ${helper} + ${SLACK}`] : []
  const third: string[] = []
  for (const part of others) {
    const b = await sizeOf(`${name}-b`, subject.entry('bare', [part]), dist)
    const d = await sizeOf(`${name}-d`, subject.entry('wrapped', [part]), dist)
    if (d - c < (b - a) / 2) {
      third.push(`${label}.${part}: d-c ${d - c} < (b-a)/2 ${(b - a) / 2}`)
    }
  }
  return { second, third }
}

/**
 * A copy of the built package for a control to damage: the helper and one component's modules.
 */
const scratchDist = (name: string, subpath: string): string => {
  const copy = path.join(WORK, name)
  rmSync(copy, { force: true, recursive: true })
  mkdirSync(copy, { recursive: true })
  cpSync(path.join(DIST_DIR, 'part.js'), path.join(copy, 'part.js'))
  cpSync(path.join(DIST_DIR, subpath), path.join(copy, subpath), { recursive: true })
  return copy
}

describe("AC-base-ui-bridge-39 and AC-base-ui-overlay-completion-43: an unused part is dropped by the consumer's bundler", () => {
  // Components with a Root, a styled part and a part to leave unused: the ones of three or more
  // parts. A component of two has no part left over to drop.
  const subpaths = readBaseUiTypes('current')
    .filter(({ parts, subpath }) => !SINGLE_COMPONENT.has(subpath) && parts.length >= 3)
    .map(({ subpath }) => subpath)

  it('covers the components that have a part to leave unused, one pair for each of the six but Menubar', () => {
    expect(subpaths).toEqual([
      'dialog',
      'popover',
      'menu',
      'select',
      'tooltip',
      'accordion',
      'collapsible',
      'tabs',
      'number-field',
      'field',
      'slider',
      'toolbar',
      'alert-dialog',
      'context-menu',
      'preview-card',
      'combobox',
      'autocomplete',
    ])
    expect(COMPLETION_SUBPATHS.filter((subpath) => !subpaths.includes(subpath))).toEqual([
      'menubar',
    ])
  })

  it(`keeps the helper at most ${HELPER_CEILING} bytes`, { timeout: 120_000 }, async () => {
    expect(await helperCost(DIST_DIR, 'built')).toBeLessThanOrEqual(HELPER_CEILING)
  })

  for (const subpath of subpaths) {
    it(
      `${subpath}: the wrapper adds the helper and its own calls, and drops every unused part`,
      { timeout: 300_000 },
      async () => {
        const helper = await helperCost(DIST_DIR, subpath)
        const { second, third } = await bundleProblems(
          await subjectOf(subpath),
          helper,
          DIST_DIR,
          subpath,
        )
        expect([...second, ...third]).toEqual([])
      },
    )
  }

  it(
    'menubar: the pair is Menubar and Menu.Trigger, and the wrapper adds the helper and its own calls and drops every other part of Menu',
    { timeout: 300_000 },
    async () => {
      const subject = await menubarSubject()
      expect(subject.others.length).toBeGreaterThan(0)
      expect(subject.entry('wrapped', [])).toContain('@navecss/base-ui/menubar')
      const helper = await helperCost(DIST_DIR, 'menubar')
      const { second, third } = await bundleProblems(subject, helper, DIST_DIR, 'menubar')
      expect([...second, ...third]).toEqual([])
    },
  )

  it(
    'control: a helper that keeps a whole component at module scope is reported, by its size and for every other part of the component',
    { timeout: 300_000 },
    async () => {
      const dist = scratchDist('retaining-helper', 'dialog')
      const helperFile = path.join(dist, 'part.js')
      writeFileSync(
        helperFile,
        `import { Dialog } from '@base-ui/react/dialog'\nglobalThis.retained = Dialog\n${readFileSync(helperFile, 'utf8')}`,
      )
      const helper = await helperCost(dist, 'retaining')
      expect(helper).toBeGreaterThan(HELPER_CEILING)
      const subject = await subjectOf('dialog')
      const { third } = await bundleProblems(subject, helper, dist, 'retaining')
      const kept = subject?.others.map((part) => `dialog.${part}`)
      expect(third.map((problem) => problem.split(':', 1)[0])).toEqual(kept)
    },
  )

  it(
    'control: a pass-through written as a plain property is reported where the bundler cannot drop it',
    { timeout: 300_000 },
    async () => {
      const dist = scratchDist('plain-properties', 'popover')
      const modules = path.join(dist, 'popover/parts.generated.js')
      writeFileSync(
        modules,
        readFileSync(modules, 'utf8').replaceAll(
          /\/\*#__PURE__\*\/ \(\(\) => (Base\.\w+)\)\(\)/g,
          '$1',
        ),
      )
      const helper = await helperCost(dist, 'plain')
      const { second } = await bundleProblems(await subjectOf('popover'), helper, dist, 'plain')
      expect(second).toHaveLength(1)
    },
  )
})

describe('a part younger than the floor: a consumer bundle against the floor Base UI', () => {
  // `base-ui-react-floor` is the floor Base UI (1.3.0) installed beside the current one. Combobox's
  // `createItems` is younger than that, so the floor's Combobox has no such export.
  const FLOOR = 'base-ui-react-floor'
  const MISSING_EXPORT = /IMPORT_IS_UNDEFINED|no matching export/

  const missingExports = async (name: string, source: string): Promise<string[]> => {
    const { warnings } = await bundleOf(name, source, DIST_DIR, FLOOR)
    return warnings.filter((warning) => MISSING_EXPORT.test(warning))
  }

  it(
    'control: naming a part the floor Base UI does not export makes the bundler warn about the missing export',
    { timeout: 120_000 },
    async () => {
      const warnings = await missingExports(
        'young-control',
        "import { Combobox } from '@base-ui/react/combobox'\nconsole.log(Combobox.createItems)\n",
      )
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('createItems')
    },
  )

  it(
    'builds an app that imports only Button from the package root without a missing-export warning',
    { timeout: 120_000 },
    async () => {
      expect(
        await missingExports(
          'young-root',
          "import { Button } from '@navecss/base-ui'\nconsole.log(Button)\n",
        ),
      ).toEqual([])
    },
  )

  it(
    'builds an app that imports the Combobox without a missing-export warning',
    { timeout: 120_000 },
    async () => {
      expect(
        await missingExports(
          'young-combobox',
          "import { Combobox } from '@navecss/base-ui/combobox'\nconsole.log(Combobox.Root, Combobox.Input)\n",
        ),
      ).toEqual([])
    },
  )
})
