import type { AnyNode, AtRule } from 'postcss'

/**
 * AC-nextjs-used-atoms-38: a server component is read as server code, so `grid` reaches the layer
 * and `#srv` computes `display: grid` after a client navigation and on a direct load, and the
 * layer premise holds: every rule naming a built-in atom class is inside an `@layer atomic` block
 * and Nave's layer order statement comes before the first such block of each stylesheet.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'

import { atomsNamedBy } from '../helpers/atoms-flatten.ts'
import { computed, HAS_CHROMIUM, withPage } from '../helpers/chromium.ts'
import { CORE_ROOT, SKIP_REASON } from '../helpers/next-app.ts'
import { cells } from '../helpers/next-cells.ts'
import { buildApp, createVariantApp, FLOORS } from '../helpers/whole-atoms-app.ts'
import { cssFilesOf, rewriteBuiltCss } from '../helpers/whole-atoms-browser.ts'

const TIMEOUT = 900_000
const FLOOR = FLOORS[0]!

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const SKIP = SKIP_REASON ?? (HAS_CHROMIUM ? undefined : 'Chromium is not installed')

const FILES: Record<string, string> = {
  'app/page.jsx': [
    "import Link from 'next/link'",
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    '  return (',
    '    <div id="home" className={cx(\'flex\')}>',
    '      <Link id="go" href="/a">',
    '        To a',
    '      </Link>',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n'),
  'app/a/page.jsx': [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    '  return <div id="srv" className={cx(\'grid\')} />',
    '}',
    '',
  ].join('\n'),
}

let order: readonly string[] | undefined

/**
 * Nave's layer order statement, as the list of layers core's `layers.css` declares, read when a
 * row first asks: the file is core's build output, which a run that skips these rows may not have.
 */
function layerOrder(): readonly string[] {
  if (order !== undefined) return order
  const text = readFileSync(path.join(CORE_ROOT, 'dist/layers.css'), 'utf8')
  const statement = postcss
    .parse(text)
    .nodes.find(
      (node) => node.type === 'atrule' && node.name === 'layer' && node.nodes === undefined,
    )
  if (statement?.type !== 'atrule') throw new Error('core has no layer order statement')
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- a lazy memo: the first row reads the file and later rows reuse the list
  order = statement.params.split(',').map((layer) => layer.trim())
  return order
}

/**
 * Whether the node sits inside a block `@layer atomic { ... }`.
 */
function isInAtomicBlock(node: AnyNode): boolean {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (parent.type === 'atrule' && isAtomicRule(parent as AtRule)) return true
  }
  return false
}

function isAtomicRule(rule: AtRule): boolean {
  return rule.name === 'layer' && rule.params.trim() === 'atomic' && rule.nodes !== undefined
}

function isAtomicBlock(node: AnyNode): node is AtRule {
  return node.type === 'atrule' && isAtomicRule(node)
}

/**
 * Whether the node is Nave's layer order statement.
 */
function isOrderStatement(node: AnyNode): node is AtRule {
  if (node.type !== 'atrule' || node.name !== 'layer' || node.nodes !== undefined) return false
  const layers = node.params.split(',').map((layer) => layer.trim())
  return layers.join(',') === layerOrder().join(',')
}

/**
 * The selectors of the rules outside every `@layer atomic` block that name a built-in atom class.
 */
function atomRulesOutsideTheLayer(css: string): string[] {
  const outside: string[] = []
  postcss.parse(css).walkRules((rule) => {
    if (!isInAtomicBlock(rule) && atomsNamedBy(rule.selector).length > 0) {
      outside.push(rule.selector)
    }
  })
  return outside
}

/**
 * The offset a node starts at in its source.
 */
function offsetOf(node: AnyNode): number {
  return node.source?.start?.offset ?? -1
}

/**
 * Whether the stylesheet has a block `@layer atomic` and Nave's order statement does not come
 * before the first one.
 */
function isOrderStatementLate(css: string): boolean {
  const blocks: number[] = []
  const statements: number[] = []
  postcss.parse(css).walkAtRules('layer', (rule) => {
    if (isAtomicBlock(rule)) blocks.push(offsetOf(rule))
    else if (isOrderStatement(rule)) statements.push(offsetOf(rule))
  })
  if (blocks.length === 0) return false
  const first = Math.min(...blocks)
  return statements.every((offset) => !(offset < first))
}

interface Sheet {
  readonly css: string
  readonly file: string
}

/**
 * Every stylesheet under the app's `.next/static`.
 */
function sheetsOf(app: NextApp): Sheet[] {
  return cssFilesOf(app).map((file) => ({
    css: readFileSync(file, 'utf8'),
    file: path.basename(file),
  }))
}

/**
 * The first stylesheet that has a block `@layer atomic`.
 */
function sheetWithLayer(sheets: readonly Sheet[]): string {
  const sheet = sheets.find((candidate) =>
    postcss.parse(candidate.css).some((node) => isAtomicBlock(node)),
  )
  if (sheet === undefined) throw new Error('no stylesheet holds an @layer atomic block')
  return sheet.css
}

/**
 * The stylesheet with the first atom rule of the first atomic block copied after the block.
 */
function withRuleOutside(css: string): string {
  const root = postcss.parse(css)
  const block = root.nodes.find((node) => isAtomicBlock(node))
  if (block?.type !== 'atrule') throw new Error('no atomic block')
  const rule = block.nodes?.find(
    (node) => node.type === 'rule' && atomsNamedBy(node.selector).length > 0,
  )
  if (rule === undefined) throw new Error('no atom rule in the block')
  block.after(rule.clone())
  return root.toString()
}

/**
 * The stylesheet with its order statements moved after the first atomic block.
 */
function withStatementAfter(css: string): string {
  const root = postcss.parse(css)
  const block = root.nodes.find((node) => isAtomicBlock(node))
  const statements = root.nodes.filter((node) => isOrderStatement(node))
  if (block === undefined || statements.length === 0) throw new Error('nothing to move')
  for (const statement of statements) statement.remove()
  block.after(statements.map((statement) => statement.clone()))
  return root.toString()
}

/**
 * The stylesheet without the rules whose selector is exactly the class of `grid`.
 */
function withoutGridRule(css: string): string {
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    if (rule.selector === '.nave-grid') rule.remove()
  })
  return root.toString()
}

describe.skipIf(SKIP !== undefined)(
  `a server component read as server code${SKIP === undefined ? '' : ` (skipped: ${SKIP})`}`,
  () => {
    for (const cell of cells()) {
      it(
        `${cell.name}: AC-nextjs-used-atoms-38: #srv computes display grid after a client navigation and on a direct load, and the layer premise holds`,
        async () => {
          const trimmed = await builtApp(cell, 'trimmed')
          const every = await builtApp(cell, 'every')

          const server = await trimmed.start()
          try {
            await server.get('/')
            await withPage(async (page) => {
              await page.goto(`${server.origin}/`)
              await page.evaluate('window.__stillHere = true')
              await page.click('#go')
              await page.waitForSelector('#srv', { state: 'attached' })
              // A client navigation: the page the script ran on is the page still showing.
              expect(await page.evaluate('window.__stillHere === true')).toBe(true)
              expect(await computed(page, '#srv', 'display')).toBe('grid')

              await page.goto(`${server.origin}/a`)
              expect(await page.evaluate('window.__stillHere === undefined')).toBe(true)
              expect(await computed(page, '#srv', 'display')).toBe('grid')
            })
          } finally {
            await server.stop()
          }

          for (const [name, app] of [
            ['the trimmed build', trimmed],
            ['the every-atom build', every],
          ] as const) {
            const sheets = sheetsOf(app)
            expect(sheets.length, `${name} wrote no stylesheet`).toBeGreaterThan(0)
            for (const sheet of sheets) {
              expect(atomRulesOutsideTheLayer(sheet.css), `${name}, ${sheet.file}`).toEqual([])
              expect(isOrderStatementLate(sheet.css), `${name}, ${sheet.file}`).toBe(false)
            }
          }

          // Controls: the checks reach the case. A scratch copy of the trimmed stylesheet with an
          // atom rule outside the layer, and one with the order statement after the layer, red them.
          const layered = sheetWithLayer(sheetsOf(trimmed))
          expect(atomRulesOutsideTheLayer(layered)).toEqual([])
          expect(isOrderStatementLate(layered)).toBe(false)
          expect(atomRulesOutsideTheLayer(withRuleOutside(layered)).length).toBeGreaterThan(0)
          expect(isOrderStatementLate(withStatementAfter(layered))).toBe(true)

          // Control: with the rule for `grid` dropped from the stylesheet, `#srv` does not compute
          // grid, so the check above reads the stylesheet's rule and not something else.
          rewriteBuiltCss(trimmed, withoutGridRule)
          const dropped = await trimmed.start()
          try {
            await dropped.get('/a')
            await withPage(async (page) => {
              await page.goto(`${dropped.origin}/a`)
              expect(await computed(page, '#srv', 'display')).toBe('block')
            })
          } finally {
            await dropped.stop()
          }
        },
        TIMEOUT,
      )
    }
  },
)

/**
 * Builds the variant at the README floor, expects it to succeed and returns the app.
 */
async function builtApp(cell: Cell, variant: 'every' | 'trimmed'): Promise<NextApp> {
  const app = await createVariantApp(cell, variant, FLOOR, FILES)
  apps.push(app)
  const run = await buildApp(app, cell)
  expect(run.code, `${variant} on ${cell.name}:\n${run.output}`).toBe(0)
  return app
}
