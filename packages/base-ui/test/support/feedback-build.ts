/**
 * The package's build with some classes taken out of the atom map, for the instrument that needs
 * "the stylesheet built with every #789 class removed" (AC-09). `buildStyles` only drops whole
 * drafts, and 17 of the 21 new classes are not drafts, so this runs the same expansion on a map
 * with those atoms left out: the layer order statement from core's own file, one `@nave` line per
 * atom (with `focusRing` on the Table T2 ones), expanded by core's PostCSS adapter.
 */
import type { AtomName } from '@navecss/core/atoms'

import { toClassName } from '@navecss/core/atoms'
import { navePlugin } from '@navecss/core/postcss'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

import type { AnyDraft } from './feedback-states.ts'

import { buildStyles } from '../../scripts/build-styles.ts'
import { atomsFor, focusRingAtoms } from '../../styles/atoms.ts'

const orderStatement = (): string => {
  const layers = fileURLToPath(import.meta.resolve('@navecss/core/layers'))
  let statement: string | undefined
  postcss.parse(readFileSync(layers, 'utf8')).walkAtRules('layer', (rule) => {
    if (statement === undefined && rule.nodes === undefined) statement = `@layer ${rule.params};`
  })
  if (statement === undefined) throw new Error(`no layer order statement in ${layers}`)
  return statement
}

/**
 * The stylesheet of the shipping build (every draft signed) without the atoms whose class is named.
 */
export const buildWithoutClasses = async (classes: readonly string[]): Promise<string> => {
  const kept = Object.fromEntries(
    Object.entries(atomsFor([])).filter(
      ([name]) => !classes.includes(toClassName(name as AtomName)),
    ),
  )
  const rules = Object.keys(kept).map((name) => {
    const directive = focusRingAtoms.includes(name) ? `${name} focusRing` : name
    return `  .${toClassName(name as AtomName)} { @nave ${directive}; }`
  })
  const source = `${orderStatement()}\n\n@layer components.nave {\n${rules.join('\n')}\n}\n`
  const result = await postcss([navePlugin({ extend: kept })]).process(source, { from: undefined })
  return result.css
}

/**
 * The shipping build with drafts of either list unsigned: one place to pass the union of both
 * lists, `Draft` and `Draft789`, to `buildStyles`.
 */
export const buildState = (unsigned: readonly AnyDraft[]): Promise<string> =>
  buildStyles({ unsigned })
