/**
 * AC-nextjs-used-atoms-33 on real builds: whole atoms at two browser floors on both bundlers,
 * against the every-atom build (the same app with `withNave()` removed) and the build through
 * core's PostCSS plugin, and the table of which cells give a nested layer and which a lowered one.
 */
import type { Rule } from 'postcss'

import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'
import type { Floor } from '../helpers/whole-atoms-app.ts'

import {
  atomsNamedBy,
  compareLayers,
  entriesOf,
  entryKey,
  flattenAtomic,
} from '../helpers/atoms-flatten.ts'
import { SKIP_REASON } from '../helpers/next-app.ts'
import { cells } from '../helpers/next-cells.ts'
import { buildApp, createVariantApp, FLOORS, FOCUS_FILES } from '../helpers/whole-atoms-app.ts'

const TIMEOUT = 900_000
const EMITTED = ['focusRing', 'srOnlyFocusable']

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

type Form = 'lowered' | 'mixed' | 'nested'

interface Measured {
  readonly cell: Cell
  readonly core: string
  readonly every: string
  readonly floor: Floor
  readonly form: Form
  readonly trimmed: string
}

const measured: Measured[] = []

/**
 * The form of the every-atom layer in each cell and at each floor, as measured. Webpack writes the
 * nested rule as it is in core's stylesheet at both floors, even at one that cannot read nesting,
 * so the lowered form is unreachable there. Turbopack writes every rule out at both floors, even
 * at the README's, so the nested form is unreachable there. A later release that changes a cell
 * reds the table with "case not reached".
 */
const PINNED: Record<string, Form> = {
  'turbopack, newest, README floor': 'lowered',
  'turbopack, newest, lowering floor': 'lowered',
  'webpack, newest, README floor': 'nested',
  'webpack, newest, lowering floor': 'nested',
  'turbopack, 16.2.0, README floor': 'lowered',
  'turbopack, 16.2.0, lowering floor': 'lowered',
  'webpack, 16.2.0, README floor': 'nested',
  'webpack, 16.2.0, lowering floor': 'nested',
}

/**
 * The raw key a flattener that leaves nested selectors unresolved gives each rule of the atoms it
 * is asked about, owning a nested rule by the outermost rule it sits in. Every rule when `owners`
 * is undefined.
 */
function unresolvedKeys(css: string, owners: ReadonlySet<string> | undefined): Set<string> {
  const keys = new Set<string>()
  postcss.parse(css).walkRules((rule) => {
    let top = rule
    while (top.parent?.type === 'rule') top = top.parent
    if (owners && atomsNamedBy(top.selector).every((atom) => !owners.has(atom))) return
    const own = rule.nodes.filter((node) => node.type === 'decl')
    keys.add(`${rule.selector} | ${own.map((node) => `${node.prop}: ${node.value}`).join('; ')}`)
  })
  return keys
}

/**
 * A scratch trimmed layer: the nested `&:focus-visible` rule of `focusRing` moved under the rule
 * of `.nave-flex`, which is added from the reference layer.
 */
function movedUnderFlex(trimmed: string, reference: string): string {
  const root = postcss.parse(trimmed)
  const ring = root.nodes
    .flatMap((node) => (node.type === 'atrule' ? (node.nodes ?? []) : []))
    .find((node): node is Rule => node.type === 'rule' && node.selector === '.nave-focus-ring')
  const nested = ring?.nodes.find((node): node is Rule => node.type === 'rule')
  if (ring === undefined || nested === undefined) throw new Error('focusRing is not nested')
  let flex: Rule | undefined
  postcss.parse(reference).walkRules((rule) => {
    if (rule.selector === '.nave-flex' && rule.parent?.type === 'atrule') flex ??= rule
  })
  if (flex === undefined) throw new Error('the reference has no .nave-flex rule')
  const added = flex.clone()
  added.append(nested.clone())
  nested.remove()
  ring.after(added)
  return root.toString()
}

/**
 * Whether the `@layer atomic` blocks of `css` write a rule inside another rule (nested), none
 * (lowered), or both (mixed).
 */
function formOf(css: string): Form {
  let nested = 0
  let written = 0
  postcss.parse(css).walkAtRules('layer', (block) => {
    if (block.params.trim() !== 'atomic' || block.nodes === undefined) return
    block.walkRules((rule) => {
      if (rule.parent?.type === 'rule') nested += 1
      else if (atomsNamedBy(rule.selector).length > 0 && rule.selector.includes(':')) written += 1
    })
  })
  if (nested === 0) return 'lowered'
  return written === 0 ? 'nested' : 'mixed'
}

/**
 * Builds the variant on the cell at the floor, expects it to succeed, and returns its CSS.
 */
async function builtLayer(
  cell: Cell,
  floor: Floor,
  variant: 'core' | 'every' | 'trimmed',
): Promise<string> {
  const app = await createVariantApp(cell, variant, floor, FOCUS_FILES)
  apps.push(app)
  const run = await buildApp(app, cell)
  expect(run.code, `${variant} on ${cell.name} at the ${floor.name}:\n${run.output}`).toBe(0)
  return app.builtCss()
}

/**
 * The rows of the table, as markdown.
 */
function tableOf(rows: readonly Measured[]): string {
  const lines = ['| cell | floor | the every-atom layer |', '| --- | --- | --- |']
  for (const row of rows) lines.push(`| ${row.cell.name} | ${row.floor.name} | ${row.form} |`)
  return lines.join('\n')
}

describe.skipIf(SKIP_REASON !== undefined)(
  `whole atoms at two floors on both bundlers${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    for (const cell of cells()) {
      for (const floor of FLOORS) {
        it(
          `${cell.name}, ${floor.name}: AC-nextjs-used-atoms-33: the trimmed layer holds every entry the every-atom build yields for an emitted atom, and the core adapter's build agrees with the every-atom build`,
          async () => {
            const every = await builtLayer(cell, floor, 'every')
            const core = await builtLayer(cell, floor, 'core')
            const trimmed = await builtLayer(cell, floor, 'trimmed')
            measured.push({ cell, core, every, floor, form: formOf(every), trimmed })

            // The reference does not come from the plugin under test alone.
            const everyKeys = flattenAtomic(every).map((entry) => entryKey(entry))
            expect(everyKeys.length).toBeGreaterThan(0)
            expect(flattenAtomic(core).map((entry) => entryKey(entry))).toEqual(everyKeys)

            expect(compareLayers(trimmed, every, EMITTED)).toEqual({
              missing: [],
              outside: [],
              unexpected: [],
            })
            // The comparison reaches something: the every-atom layer holds entries of atoms the
            // trimmed one does not.
            expect(entriesOf(flattenAtomic(every), 'srOnly').length).toBeGreaterThan(0)
            expect(entriesOf(flattenAtomic(every), 'flex').length).toBeGreaterThan(0)
            expect(entriesOf(flattenAtomic(trimmed), 'flex')).toEqual([])
          },
          TIMEOUT,
        )

        it(`${cell.name}, ${floor.name}: AC-nextjs-used-atoms-33: by name, focusRing's focus-visible entry and srOnlyFocusable's three entries are in the trimmed layer, and none names srOnly`, () => {
          const row = measured.find((m) => m.cell === cell && m.floor === floor)
          expect(row, 'the build row did not run').toBeDefined()
          const entries = flattenAtomic(row!.trimmed)
          const reference = flattenAtomic(row!.every)
          const ring = entries.find((e) => e.selector === '.nave-focus-ring:focus-visible')
          const referenceRing = reference.find(
            (e) => e.selector === '.nave-focus-ring:focus-visible',
          )
          expect(ring, 'no .nave-focus-ring:focus-visible entry').toBeDefined()
          expect(ring?.declarations).toEqual(referenceRing?.declarations)
          expect(ring?.declarations.some((line) => line.startsWith('outline-offset'))).toBe(true)
          expect(ring?.declarations.some((line) => line.startsWith('outline'))).toBe(true)
          expect(entries.map((e) => e.selector)).toEqual(
            expect.arrayContaining([
              '.nave-sr-only-focusable',
              '.nave-sr-only-focusable:focus-visible',
              '.nave-sr-only-focusable:focus-within',
            ]),
          )
          expect(entries.filter((e) => e.selector.includes('.nave-sr-only '))).toEqual([])
          expect(entriesOf(entries, 'srOnly')).toEqual([])
        })
      }
    }

    it('AC-nextjs-used-atoms-33: the table of cells and floors is the one measured', () => {
      expect(measured.length, 'the build rows did not all run').toBe(cells().length * FLOORS.length)
      // eslint-disable-next-line no-console -- the table is the row's printed result
      console.log(`\n${tableOf(measured)}\n`)
      for (const row of measured) {
        const key = `${row.cell.name}, ${row.floor.name}`
        expect(row.form, `case not reached: ${key} gave ${row.form}, measured ${PINNED[key]}`).toBe(
          PINNED[key],
        )
      }
      // The assumption: the nested form is reached in at least one cell, and the lowered form in
      // at least one Turbopack cell at the lowering floor.
      expect(measured.some((row) => row.form === 'nested')).toBe(true)
      expect(
        measured.some(
          (row) =>
            row.form === 'lowered' &&
            row.cell.bundler === 'turbopack' &&
            row.floor.name === 'lowering floor',
        ),
      ).toBe(true)
    })

    it('AC-nextjs-used-atoms-33: control, a nested rule moved under another atom is seen only when resolved', () => {
      const row = measured.find((candidate) => candidate.form === 'nested')
      expect(row, 'case not reached: no cell gave the nested form').toBeDefined()
      const reference = row!.every
      const emitted = ['flex', ...EMITTED]
      const scratch = movedUnderFlex(row!.trimmed, reference)

      // The scratch layer differs from the real trimmed one, and the real flattener reads the move.
      expect(scratch).not.toBe(row!.trimmed)
      const selectors = flattenAtomic(scratch).map((entry) => entry.selector)
      expect(selectors).toContain('.nave-flex:focus-visible')
      expect(selectors).not.toContain('.nave-focus-ring:focus-visible')

      // A flattener that leaves `&:focus-visible` unresolved finds nothing wrong.
      const wanted = [...unresolvedKeys(reference, new Set(emitted))]
      const have = unresolvedKeys(scratch, undefined)
      expect(wanted.filter((key) => !have.has(key))).toEqual([])
      expect([...have].filter((key) => !unresolvedKeys(reference, undefined).has(key))).toEqual([])

      // The real flattener reds.
      const compared = compareLayers(scratch, reference, emitted)
      expect(compared.missing.some((key) => key.includes('.nave-focus-ring:focus-visible'))).toBe(
        true,
      )
      expect(compared.unexpected.some((key) => key.includes('.nave-flex:focus-visible'))).toBe(true)
    })
  },
)
