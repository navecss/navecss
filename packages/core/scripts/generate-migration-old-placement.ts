/**
 * Writes `test/fixtures/migration-old-placement.ts`: what the release before native order
 * printed for every input the migration covers (`test/helpers/migration-rows.ts`), from the
 * PostCSS host and, where it differs, from the text expander. COMMITTED, generated once and not
 * on every run; it lives with the migration module and is removed with it.
 *
 * It reads the plugin out of a tree of the previous release instead of out of this one, so the
 * numbers are that release's own. To regenerate it, from the repository root:
 *
 *   git archive 256384a7 packages/core | tar -x -C ../scratch-old
 *   ln -s "$PWD/node_modules" ../scratch-old/node_modules
 *   ln -s "$PWD/packages/core/node_modules" ../scratch-old/packages/core/node_modules
 *   node packages/core/scripts/generate-migration-old-placement.ts ../scratch-old/packages/core
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { format, resolveConfig } from 'prettier'

import { isEquivalent } from '../test/helpers/css-equivalence.ts'
import { MIGRATION_ROWS } from '../test/helpers/migration-rows.ts'

const core = process.argv[2]
if (core === undefined) throw new Error('give the path of the previous release’s packages/core')

const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures/migration-old-placement.ts',
)
const COMMIT = '256384a7a750f5c9da983823e2b9671c1f292fde'
const COMMAND =
  'git archive 256384a7 packages/core | tar -x -C ../scratch-old (node_modules linked in), then: node packages/core/scripts/generate-migration-old-placement.ts ../scratch-old/packages/core'

interface Extend {
  readonly extend?: Record<string, never>
}

interface OldTree {
  readonly expandText: (css: string, options: Extend) => { readonly css: string }
  readonly navePlugin: (options: Extend) => postcss.AcceptedPlugin
}

interface Printed {
  readonly id: string
  readonly postcss: string
  readonly text?: string
}

/**
 * The previous release's plugin and text expander, loaded out of the tree at `root`.
 */
async function loadOldTree(root: string): Promise<OldTree> {
  const source = (file: string): string => pathToFileURL(path.join(root, 'src', file)).href
  const plugin = (await import(source('postcss.ts'))) as Pick<OldTree, 'navePlugin'>
  const text = (await import(source('directive/expand-text.ts'))) as Pick<OldTree, 'expandText'>
  return { ...plugin, ...text }
}

/**
 * What the previous release printed for every row.
 */
async function printedBy(old: OldTree): Promise<Printed[]> {
  const printed: Printed[] = []
  for (const row of MIGRATION_ROWS) {
    const options = row.extend === undefined ? {} : { extend: row.extend as Record<string, never> }
    const result = await postcss([old.navePlugin(options)]).process(row.input, { from: undefined })
    const text = old.expandText(row.input, options).css
    printed.push(
      isEquivalent(text, result.css)
        ? { id: row.id, postcss: result.css }
        : { id: row.id, postcss: result.css, text },
    )
  }
  return printed
}

const printed = await printedBy(await loadOldTree(path.resolve(core)))
const source = `/**
 * What the release before native order printed for every input of the first-minor fixtures, from
 * the PostCSS host and, where it differs structurally, from the text expander. Generated once;
 * lives with the migration module and is removed with it. Do not edit by hand.
 *
 * Commit: ${COMMIT}
 * Command: ${COMMAND}
 */
export interface OldPlacementRow {
  readonly id: string
  readonly postcss: string
  readonly text?: string
}

export const OLD_PLACEMENT_COMMIT = ${JSON.stringify(COMMIT)}

export const OLD_PLACEMENT_COMMAND = ${JSON.stringify(COMMAND)}

export const OLD_PLACEMENT: readonly OldPlacementRow[] = ${JSON.stringify(printed)}
`
const options = { ...(await resolveConfig(OUTPUT)), filepath: OUTPUT }
writeFileSync(OUTPUT, await format(source, options))
