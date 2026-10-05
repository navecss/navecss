import { mkdirSync, writeFileSync } from 'node:fs'
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
 * The minified size of a consumer entry bundled by rolldown, with React left external. `alias`
 * points `@navecss/base-ui` at the built package.
 */
const sizeOf = async (name: string, source: string): Promise<number> => {
  mkdirSync(WORK, { recursive: true })
  const entry = path.join(WORK, `${name}.js`)
  writeFileSync(entry, source)
  const bundle = await rolldown({
    external: /^react(?:-dom)?(?:\/|$)/,
    input: entry,
    logLevel: 'silent',
    resolve: { alias: { '@navecss/base-ui': DIST_DIR } },
  })
  const { output } = await bundle.generate({ format: 'esm', minify: true })
  return output[0].code.length
}

const entry = (specifier: string, top: string, parts: readonly string[]): string =>
  `import { ${top} } from '${specifier}'\nconsole.log(${parts.map((part) => `${top}.${part}`).join(', ')})\n`

const sizeWith = (
  specifier: string,
  top: string,
  parts: readonly string[],
  name: string,
): Promise<number> => sizeOf(name, entry(specifier, top, parts))

/**
 * The sizes for one component: Root plus its main styled part as the pair (the Popup where it has
 * one), and, as what an unused part costs, the largest of the parts the pair leaves out. The
 * largest, not the first: the wrapper's own fixed cost (about half a kilobyte of helper) is paid
 * once by any wrapped part, so a part smaller than twice that could never show in a relative bound.
 */
const measure = async (
  subpath: string,
): Promise<{ direct: number; extended: number; extra: string; nave: number } | undefined> => {
  const top = topName(subpath)
  const keys = Object.keys(
    ((await import(/* @vite-ignore */ `@base-ui/react/${subpath}`)) as Record<string, object>)[
      top
    ] ?? {},
  )
  const styled = keys.includes('Popup')
    ? 'Popup'
    : keys.find((key) => key !== 'Root' && tableP.has(`${top}.${key}`))
  if (!keys.includes('Root') || styled === undefined) {
    return undefined
  }
  const pair = ['Root', styled]
  const base = `@base-ui/react/${subpath}`
  const direct = await sizeWith(base, top, pair, `${subpath}-a`)
  let largest = { cost: 0, extra: '', extended: direct }
  for (const key of keys.filter((candidate) => !pair.includes(candidate))) {
    const extended = await sizeWith(base, top, [...pair, key], `${subpath}-b`)
    if (extended - direct > largest.cost) {
      largest = { cost: extended - direct, extended, extra: key }
    }
  }
  const nave = await sizeWith(`@navecss/base-ui/${subpath}`, top, pair, `${subpath}-c`)
  return { direct, extended: largest.extended, extra: largest.extra, nave }
}

/**
 * What the wrapper helper costs a bundle on its own: the built `part.js`, minified, with React
 * external. Any wrapped part pays it once.
 */
const helperCost = (): Promise<number> =>
  sizeOf(
    'helper',
    `import { wrapPart } from '${path.join(DIST_DIR, 'part.js')}'\nconsole.log(wrapPart)\n`,
  )

// What the used, wrapped part may add besides the helper: its call and its class string.
const SLACK = 120

const dropsUnused = ({
  direct,
  extended,
  nave,
}: {
  direct: number
  extended: number
  nave: number
}): boolean => nave - direct < (extended - direct) / 2

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

  for (const subpath of subpaths) {
    it(
      `${subpath}: the wrapper adds less than half of what an unused part costs`,
      { timeout: 180_000 },
      async () => {
        const sizes = await measure(subpath)
        expect(sizes, `${subpath} has a Root and a styled part`).toBeDefined()
        if (sizes === undefined) {
          return
        }
        expect(sizes.extended - sizes.direct, `${sizes.extra} costs something`).toBeGreaterThan(0)
        // The wrapper adds its helper and the used part's own call, and nothing of any unused part.
        const helper = await helperCost()
        expect(
          sizes.nave - sizes.direct,
          `${JSON.stringify(sizes)}, helper ${helper}`,
        ).toBeLessThanOrEqual(helper + SLACK)
        // Where an unused part costs enough to show against the helper, the relative bound holds too.
        if (sizes.extended - sizes.direct >= 2 * helper) {
          expect(dropsUnused(sizes), `${sizes.extra}: ${JSON.stringify(sizes)}`).toBe(true)
        }
      },
    )
  }

  it(
    'control: a pass-through written as a plain property is not dropped',
    { timeout: 120_000 },
    async () => {
      mkdirSync(WORK, { recursive: true })
      writeFileSync(
        path.join(WORK, 'naive.js'),
        "import { Dialog as B } from '@base-ui/react/dialog'\nexport const Dialog = { Root: B.Root, Popup: B.Popup, Trigger: B.Trigger, Portal: B.Portal, Backdrop: B.Backdrop, Title: B.Title }\n",
      )
      const direct = await sizeOf(
        'naive-a',
        entry('@base-ui/react/dialog', 'Dialog', ['Root', 'Popup']),
      )
      const extended = await sizeOf(
        'naive-b',
        entry('@base-ui/react/dialog', 'Dialog', ['Root', 'Popup', 'Trigger']),
      )
      const nave = await sizeOf(
        'naive-c',
        entry(path.join(WORK, 'naive.js'), 'Dialog', ['Root', 'Popup']),
      )
      expect(dropsUnused({ direct, extended, nave })).toBe(false)
    },
  )
})
