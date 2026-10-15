import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import { DIST_DIR } from './support/dist.ts'
import { FEEDBACK_KEYS, FEEDBACK_SUBPATHS, FEEDBACK_TOP } from './support/feedback-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { COMPLETION_SUBPATHS, SINGLE_COMPONENT, topName } from './support/subpaths.ts'
import { tableP } from './support/table-p.ts'

const WORK = path.join(PACKAGE_DIR, 'node_modules/.cache/bundle-tests')

/**
 * The minified size of a consumer entry bundled by rolldown, with React left external. `dist` is
 * the built package `@navecss/base-ui` resolves to.
 */
const sizeOf = async (name: string, source: string, dist: string = DIST_DIR): Promise<number> => {
  mkdirSync(WORK, { recursive: true })
  const entry = path.join(WORK, `${name}.js`)
  writeFileSync(entry, source)
  const bundle = await rolldown({
    external: /^react(?:-dom)?(?:\/|$)/,
    input: entry,
    logLevel: 'silent',
    resolve: { alias: { '@navecss/base-ui': dist } },
  })
  const { output } = await bundle.generate({ format: 'esm', minify: true })
  return output[0].code.length
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
  // parts. A component of two has no part left over to drop. The seven of the feedback and
  // navigation release are measured below, with pairs written out.
  const subpaths = readBaseUiTypes('current')
    .filter(({ parts, subpath }) => !SINGLE_COMPONENT.has(subpath) && parts.length >= 3)
    .map(({ subpath }) => subpath)
    .filter((subpath) => !(FEEDBACK_SUBPATHS as readonly string[]).includes(subpath))

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
    'AC-base-ui-overlay-completion-43: a used part younger than the floor keeps no other part of its component',
    { timeout: 120_000 },
    async () => {
      // At the installed Base UI, which has `createItems`.
      const use = 'console.log(Combobox.Root, Combobox.Input, Combobox.createItems)\n'
      const direct = await sizeOf(
        'young-used-direct',
        `import { Combobox } from '@base-ui/react/combobox'\n${use}`,
      )
      const wrapped = await sizeOf(
        'young-used-wrapped',
        `import { Combobox } from '@navecss/base-ui/combobox'\n${use}`,
      )
      // The helper's measured size and the part's own call, as for every other part. A part read by
      // a key instead of by name keeps every part of the component, tens of thousands of bytes more.
      const helper = await helperCost(DIST_DIR, 'young-used')
      expect(wrapped - direct).toBeLessThanOrEqual(helper + SLACK)
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

/**
 * The pair each of the seven is measured with: its Root and one styled part. The rest of the
 * namespace is left unused, and the bundler must drop it.
 */
const FEEDBACK_PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  avatar: ['Root', 'Image'],
  meter: ['Root', 'Track'],
  'navigation-menu': ['Root', 'Popup'],
  progress: ['Root', 'Track'],
  'scroll-area': ['Root', 'Viewport'],
  // Toast.Root is a styled part with the longest class string, so the pair is the provider, which
  // is Base UI's own, and the viewport.
  toast: ['Provider', 'Viewport'],
}

const byCodeUnit = (a: string, b: string): number => a.localeCompare(b)

/**
 * The entry that uses Meter.Root and Progress.Root together, and the one that uses one of the two,
 * from Base UI (`bare`) or from this package (`wrapped`).
 */
const bothRoots = (side: 'bare' | 'wrapped'): string => {
  const prefix = side === 'bare' ? '@base-ui/react' : '@navecss/base-ui'
  return `import { Meter } from '${prefix}/meter'\nimport { Progress } from '${prefix}/progress'\nconsole.log(Meter.Root, Progress.Root)\n`
}

const oneRoot = (side: 'bare' | 'wrapped', which: 'Meter' | 'Progress'): string => {
  const prefix = side === 'bare' ? '@base-ui/react' : '@navecss/base-ui'
  return `import { ${which} } from '${prefix}/${which.toLowerCase()}'\nconsole.log(${which}.Root)\n`
}

const feedbackSubject = (subpath: string): Subject => {
  const top = FEEDBACK_TOP[subpath] ?? ''
  const pair = FEEDBACK_PAIRS[subpath] ?? ['Root', 'Root']
  return {
    entry: (side, extra) =>
      entry(side === 'bare' ? `@base-ui/react/${subpath}` : `@navecss/base-ui/${subpath}`, top, [
        ...pair,
        ...extra,
      ]),
    label: subpath,
    others: (FEEDBACK_KEYS[subpath as keyof typeof FEEDBACK_KEYS] ?? []).filter(
      (key) => !pair.includes(key),
    ),
  }
}

describe("AC-base-ui-feedback-navigation-46 (extends AC-base-ui-bridge-39): an unused part of the seven is dropped by the consumer's bundler", () => {
  it('measures one pair per subpath of the seven, and each pair is two parts of its namespace', () => {
    expect(Object.keys(FEEDBACK_PAIRS).toSorted(byCodeUnit)).toEqual(
      FEEDBACK_SUBPATHS.filter((subpath) => subpath !== 'separator').toSorted(byCodeUnit),
    )
    for (const [subpath, pair] of Object.entries(FEEDBACK_PAIRS)) {
      const keys = FEEDBACK_KEYS[subpath as keyof typeof FEEDBACK_KEYS]
      expect(
        pair.every((part) => keys.includes(part)),
        `${subpath} pair`,
      ).toBe(true)
      expect(
        feedbackSubject(subpath).others.length,
        `${subpath} leaves parts unused`,
      ).toBeGreaterThan(0)
    }
  })

  for (const subpath of Object.keys(FEEDBACK_PAIRS)) {
    it(
      `${subpath}: the wrapper adds the helper and its own calls, and drops every unused part`,
      { timeout: 300_000 },
      async () => {
        const helper = await helperCost(DIST_DIR, subpath)
        const { second, third } = await bundleProblems(
          feedbackSubject(subpath),
          helper,
          DIST_DIR,
          `feedback-${subpath}`,
        )
        expect([...second, ...third]).toEqual([])
      },
    )
  }

  it(
    'separator: a single component, the wrapper adds the helper and its own call',
    { timeout: 300_000 },
    async () => {
      const subject: Subject = {
        entry: (side) =>
          `import { Separator } from '${side === 'bare' ? '@base-ui/react/separator' : '@navecss/base-ui/separator'}'\nconsole.log(Separator)\n`,
        label: 'separator',
        others: [],
      }
      const helper = await helperCost(DIST_DIR, 'separator')
      const { second, third } = await bundleProblems(
        subject,
        helper,
        DIST_DIR,
        'feedback-separator',
      )
      expect([...second, ...third]).toEqual([])
    },
  )

  it(
    'meter and progress: Meter.Root used alone keeps none of Progress, and Progress.Root alone none of Meter',
    { timeout: 300_000 },
    async () => {
      const helper = await helperCost(DIST_DIR, 'feedback-shared')
      for (const [which, other] of [
        ['Meter', 'Progress'],
        ['Progress', 'Meter'],
      ] as const) {
        const a = await sizeOf(`feedback-shared-a-${which}`, oneRoot('bare', which))
        const c = await sizeOf(`feedback-shared-c-${which}`, oneRoot('wrapped', which))
        // The wrapper's Meter.Root alone costs the helper and its own call over Base UI's.
        expect(c - a, `${which}.Root alone`).toBeLessThanOrEqual(helper + SLACK)
        // The other component's Root, added, adds at least half of what it adds to Base UI's own.
        const bareBoth = await sizeOf(`feedback-shared-b-${which}`, bothRoots('bare'))
        const wrappedBoth = await sizeOf(`feedback-shared-d-${which}`, bothRoots('wrapped'))
        const otherAlone = await sizeOf(`feedback-shared-o-${other}`, oneRoot('bare', other))
        expect(otherAlone).toBeGreaterThan(0)
        expect(wrappedBoth - c, `${other}.Root added to ${which}.Root`).toBeGreaterThanOrEqual(
          (bareBoth - a) / 2,
        )
      }
    },
  )

  it(
    'control: a pass-through written as a plain property is reported where the bundler cannot drop it',
    { timeout: 300_000 },
    async () => {
      const dist = scratchDist('plain-properties-toast', 'toast')
      const modules = path.join(dist, 'toast/parts.generated.js')
      const text = readFileSync(modules, 'utf8')
      writeFileSync(
        modules,
        text.replaceAll(/\/\*#__PURE__\*\/ \(\(\) => (Base\.\w+)\)\(\)/g, '$1'),
      )
      expect(readFileSync(modules, 'utf8')).not.toBe(text)
      const helper = await helperCost(dist, 'plain-toast')
      const { second } = await bundleProblems(feedbackSubject('toast'), helper, dist, 'plain-toast')
      expect(second).toHaveLength(1)
    },
  )
})
