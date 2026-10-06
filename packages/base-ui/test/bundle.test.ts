import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import { DIST_DIR } from './support/dist.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { SINGLE_COMPONENT, topName } from './support/subpaths.ts'
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
 * The pair a component is measured with: its Root plus its Popup (or, without one, its first
 * styled part), and every other part of its namespace.
 */
const partsOf = async (
  subpath: string,
): Promise<{ others: string[]; pair: string[]; top: string } | undefined> => {
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
  return { others: keys.filter((key) => !pair.includes(key)), pair, top }
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
  subpath: string,
  helper: number,
  dist: string,
  name: string,
): Promise<{ second: string[]; third: string[] }> => {
  const parts = await partsOf(subpath)
  if (parts === undefined) {
    return { second: [`${subpath}: no Root and styled part to measure`], third: [] }
  }
  const { others, pair, top } = parts
  const [bare, wrapped] = [`@base-ui/react/${subpath}`, `@navecss/base-ui/${subpath}`]
  const a = await sizeOf(`${name}-a`, entry(bare, top, pair), dist)
  const c = await sizeOf(`${name}-c`, entry(wrapped, top, pair), dist)
  const second =
    c - a > helper + SLACK ? [`${subpath}: c-a ${c - a} > helper ${helper} + ${SLACK}`] : []
  const third: string[] = []
  for (const part of others) {
    const b = await sizeOf(`${name}-b`, entry(bare, top, [...pair, part]), dist)
    const d = await sizeOf(`${name}-d`, entry(wrapped, top, [...pair, part]), dist)
    if (d - c < (b - a) / 2) {
      third.push(`${subpath}.${part}: d-c ${d - c} < (b-a)/2 ${(b - a) / 2}`)
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

describe("AC-base-ui-bridge-39: an unused part is dropped by the consumer's bundler", () => {
  // Components with a Root, a styled part and a part to leave unused: the ones of three or more
  // parts. A component of two has no part left over to drop.
  const subpaths = readBaseUiTypes('current')
    .filter(({ parts, subpath }) => !SINGLE_COMPONENT.has(subpath) && parts.length >= 3)
    .map(({ subpath }) => subpath)

  it('covers the components that have a part to leave unused', () => {
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
        const { second, third } = await bundleProblems(subpath, helper, DIST_DIR, subpath)
        expect([...second, ...third]).toEqual([])
      },
    )
  }

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
      const { third } = await bundleProblems('dialog', helper, dist, 'retaining')
      const parts = await partsOf('dialog')
      const kept = parts?.others.map((part) => `dialog.${part}`)
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
      const { second } = await bundleProblems('popover', helper, dist, 'plain')
      expect(second).toHaveLength(1)
    },
  )
})
