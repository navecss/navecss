/**
 * Builds `dist/styles.css`, the one stylesheet this package ships: the layer order statement, then
 * every role atom of `styles/atoms.ts` as a `components.nave` class rule, expanded at build time
 * through core's PostCSS adapter so a consumer needs no PostCSS and no `@nave` directive.
 *
 * Run: node scripts/build-styles.ts
 *
 * `buildStyles` is exported for the tests; the file-writing driver stays behind `isMain` so
 * importing this module never touches the filesystem.
 */
import type { AtomName } from '@navecss/core/atoms'

import { toClassName } from '@navecss/core/atoms'
import { navePlugin } from '@navecss/core/postcss'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

import { atoms, focusRingAtoms } from '../styles/atoms.ts'

const OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/styles.css')

// Compare REALPATHS on both sides: `import.meta.url` is symlink-resolved and `process.argv[1]` is
// not, so a run through a symlinked path (macOS `/tmp`) would otherwise write nothing and exit 0.
// The `argv[1] !== undefined` limb keeps an import of this module from resolving `undefined`
// against the working directory.
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

/**
 * The layer order statement, read from core's own copy rather than typed here: layer order is
 * fixed by first appearance, so the statement must be Nave's, byte for byte.
 */
const readOrderStatement = (): string => {
  const layersPath = fileURLToPath(import.meta.resolve('@navecss/core/layers'))
  const root = postcss.parse(readFileSync(layersPath, 'utf8'))
  let statement: string | undefined
  root.walkAtRules('layer', (rule) => {
    if (statement === undefined && rule.nodes === undefined) statement = `@layer ${rule.params};`
  })
  if (statement === undefined) throw new Error(`no layer order statement in ${layersPath}`)
  return statement
}

const directive = (name: string): string =>
  focusRingAtoms.includes(name) ? `${name} focusRing` : name

/**
The built stylesheet, as the string `dist/styles.css` holds.
 */
export const buildStyles = async (): Promise<string> => {
  // `toClassName` is typed for core's own atom names; it is a plain camelCase-to-kebab mapping
  // with the `nave-` prefix, which is exactly the class an extend atom's name resolves to.
  const rules = Object.keys(atoms).map(
    (name) => `  .${toClassName(name as AtomName)} { @nave ${directive(name)}; }`,
  )
  const source = `${readOrderStatement()}\n\n@layer components.nave {\n${rules.join('\n')}\n}\n`
  const result = await postcss([navePlugin({ extend: atoms })]).process(source, { from: undefined })
  return result.css
}

if (isMain) {
  mkdirSync(path.dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, await buildStyles())
}
