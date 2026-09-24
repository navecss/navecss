/**
 * Nave CSS build step. Owns everything CSS in dist/:
 *   atoms.ts       → dist/atomic.css     (generated)
 *   index.css      → dist/index.css      (copied)
 *   layers.css     → dist/layers.css     (copied)
 *   no-tokens.css  → dist/no-tokens.css  (copied; R11)
 *   reset.css      → dist/reset.css      (transformed, not copied verbatim — see the
 *                                          comment at this file's reset-handling code below)
 *
 * The entry point ships from dist/ so that its relative imports resolve
 * against the generated atomic.css sitting next to it. Shipping index.css
 * from src/ is what broke every consumer's one-line setup.
 *
 * Run: node scripts/build-css.ts
 *
 * `renderNested`/`renderAtBlock` are exported for `test/build-css.test.ts`:
 * before that test existed, nothing exercised these two functions at all,
 * so the `anchorSelectorList` wiring below them could be reverted with the
 * whole local suite staying green. The file-writing
 * driver below stays guarded behind `isMain` so importing the module for
 * those exports never touches the filesystem or regenerates dist/ as a test
 * side effect.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AtomDefinition, AtomName } from '../src/atoms.ts'

import { atoms, toClassName } from '../src/atoms.ts'
import { anchorSelectorList } from '../src/selector-utils.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../src')
const DIST = path.resolve(__dirname, '../dist')
const OUTPUT = path.resolve(DIST, 'atomic.css')
// Compare REALPATHS on both sides. `import.meta.url` is symlink-resolved
// by Node and `process.argv[1]` is left exactly as given, so an invocation through a symlinked
// absolute path (macOS's `/tmp` -> `/private/tmp`, for one) made the two disagree: this script
// exited 0 having written nothing, and `@navecss/core`'s `.`, `./no-tokens`, `./reset`,
// `./layers` and `./atomic` exports all resolve to the five CSS files it is the sole writer of.
// `check:pack` cannot catch that: it runs `attw --exclude-entrypoints . layers no-tokens reset
// atomic`, excluding exactly those five by name. `pnpm build` invokes this script relatively (`node
// scripts/build-css.ts`, cwd `packages/core`), which Node resolves to a realpath, so CI was
// never affected and the defect was latent rather than live.
//
// The `process.argv[1] !== undefined` limb is load-bearing, not padding: with `argv[1]`
// undefined (this module IMPORTED for its `renderNested`/`renderAtBlock` exports, as
// `test/build-css.test.ts` does) `realpathSync(undefined)` coerces to the string
// `'undefined'` and resolves it against the CURRENT WORKING DIRECTORY, so it raises `ENOENT`
// in a cwd with no such file and returns `<cwd>/undefined` in one that has it. The limb is
// what keeps either outcome from being reached at all. (`!== undefined` rather than `&&`
// because `isMain` must stay a boolean: `unicorn/consistent-boolean-name`.)
//
// NOT COVERED BY THE `scripts/` SWEEP. `scripts/check-main-guard-spaced-path.test.mjs` walks
// `<repo>/scripts` and keeps only `.mjs`, so this file is invisible to it on both counts and
// nothing regression-guards this guard. Everything under `packages/*/scripts/` is unenforced
// territory; widening the sweep to reach it is tracked separately, not done here.
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

/**
 * The canonical @layer order statement (architecture's cascade contract,
 * src/index.css). Restated byte-identically at the top of every generated
 * entry point: layer order in CSS is established by first appearance, so a
 * consumer importing reset.css or atomic.css standalone (both are published
 * subpath exports) still registers the seven layers in the documented order.
 * Checked byte-identical across all generated entry points in
 * consumer-path.test.ts.
 */
const LAYER_ORDER_STATEMENT =
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;'

const HEADER = `/*
 * Nave atomic utilities — generated from src/atoms.ts
 * Do not edit directly. Run \`pnpm build\` in packages/core to regenerate.
 *
 * Primary path:  .root { @nave interactive focusRing; }  (postcss plugin)
 * Escape hatch:  \`\${cx('interactive', 'focusRing')} \${styles.root}\`
 *
 * Classes are global, namespaced with nave- prefix.
 * Consumer atoms (navePlugin extend) are NOT included —
 * they are resolved inline by the PostCSS plugin only.
 *
 * Self-layered under @layer atomic: this file ships as a published subpath
 * export (./atomic) and is imported directly by some consumers, so the
 * layer guarantee has to be a property of the artifact rather than of
 * index.css's import site.
 */
`

interface MediaBlock {
  declarations?: Record<string, string>
  pseudos?: Record<string, Record<string, string>>
}

const INDENT = '  '

/**
 * Indents an already-rendered block by one more level.
 */
const indent = (block: string, depth: number): string =>
  block
    .split('\n')
    .map((line) => (line === '' ? line : INDENT.repeat(depth) + line))
    .join('\n')

const renderDecls = (decls: Record<string, string>): string =>
  Object.entries(decls)
    .map(([p, v]) => `${INDENT}${p}: ${v};`)
    .join('\n')

/**
 * Renders a nested @media / @container block.
 * Declarations are wrapped in `& { … }` for the same reason the PostCSS
 * plugin wraps them: bare declarations inside a nested at-rule need
 * CSSNestedDeclarations, which is past the Baseline 2024 floor.
 */
export function renderAtBlock(
  atName: string,
  condition: string,
  block: MediaBlock,
): string | undefined {
  const inner: string[] = []

  if (block.declarations) {
    inner.push(`& {\n${renderDecls(block.declarations)}\n}`)
  }

  if (block.pseudos) {
    for (const [pseudo, pseudoDecls] of Object.entries(block.pseudos)) {
      inner.push(`${anchorSelectorList(pseudo)} {\n${renderDecls(pseudoDecls)}\n}`)
    }
  }

  if (inner.length === 0) return undefined
  return `@${atName} ${condition} {\n${indent(inner.join('\n\n'), 1)}\n}`
}

/**
 * The nested contents of an atom's class rule, in declaration order.
 */
export function renderNested(atom: AtomDefinition): string[] {
  const nested: string[] = []

  if (atom.pseudos) {
    for (const [pseudo, pseudoDecls] of Object.entries(atom.pseudos)) {
      nested.push(`${anchorSelectorList(pseudo)} {\n${renderDecls(pseudoDecls)}\n}`)
    }
  }

  for (const atName of ['media', 'container'] as const) {
    const blocks = (atom[atName] ?? {}) as Record<string, MediaBlock>
    for (const [condition, block] of Object.entries(blocks)) {
      const rendered = renderAtBlock(atName, condition, block)
      if (rendered) nested.push(rendered)
    }
  }

  return nested
}

/**
 * Generates the full CSS string for a single atom: one class rule, with
 * pseudos and at-rules nested inside it. Same shape the @nave directive emits.
 */
function generateAtomCSS(name: AtomName): string {
  const atom = atoms[name] as AtomDefinition
  const className = toClassName(name)

  const body: string[] = []
  const baseDecls = Object.entries(atom.declarations)
  if (baseDecls.length > 0) body.push(renderDecls(atom.declarations))
  body.push(...renderNested(atom).map((block) => indent(block, 1)))

  return `.${className} {\n${body.join('\n\n')}\n}`
}

/**
 * The file-writing driver. Guarded behind `isMain` so importing this module
 * for `renderNested`/`renderAtBlock` (test) never touches the filesystem.
 */
if (isMain) {
  mkdirSync(DIST, { recursive: true })

  const atomNames = Object.keys(atoms) as AtomName[]

  const atomicBody = atomNames.map((name) => generateAtomCSS(name)).join('\n\n')
  const atomicCSS = [
    HEADER,
    LAYER_ORDER_STATEMENT,
    '',
    '@layer atomic {',
    indent(atomicBody, 1),
    '}',
    '',
  ].join('\n')

  writeFileSync(OUTPUT, atomicCSS, 'utf8')

  /**
   * reset.css is transformed, not copied verbatim: self-layered, like
   * atomic.css above. The authored source in src/reset.css stays unlayered —
   * index.css imports it plain and used to supply the layer at the import
   * site; the wrapping now happens here so the shipped artifact carries its
   * own guarantee.
   */
  const resetSource = readFileSync(path.join(SRC, 'reset.css'), 'utf8').trimEnd()
  const resetCSS = [
    `/*\n * Self-layered under @layer reset: this file ships as a published\n * subpath export (./reset) and is imported directly by some consumers, so\n * the layer guarantee has to be a property of the artifact rather than of\n * index.css's import site.\n */`,
    LAYER_ORDER_STATEMENT,
    '',
    '@layer reset {',
    indent(resetSource, 1),
    '}',
    '',
  ].join('\n')

  writeFileSync(path.join(DIST, 'reset.css'), resetCSS, 'utf8')

  /**
   * index.css ships unlayered and unmodified: it declares the order
   * statement itself and imports the other three entry points, two of them
   * now plain (no layer() keyword) since they self-layer.
   */
  writeFileSync(
    path.join(DIST, 'index.css'),
    readFileSync(path.join(SRC, 'index.css'), 'utf8'),
    'utf8',
  )

  /**
   * no-tokens.css (R11): the tokens-free entry, copied
   * unmodified for the same reason index.css is — it declares its own order
   * statement and imports reset.css/atomic.css plain, exactly like index.css,
   * just without the @navecss/tokens/css import.
   */
  writeFileSync(
    path.join(DIST, 'no-tokens.css'),
    readFileSync(path.join(SRC, 'no-tokens.css'), 'utf8'),
    'utf8',
  )

  /**
   * layers.css (ADR 0003 decision 5): the order statement, published alone,
   * for a consumer to import first. Copied unmodified, same as index.css and
   * no-tokens.css — it already carries its own copy of the statement.
   */
  writeFileSync(
    path.join(DIST, 'layers.css'),
    readFileSync(path.join(SRC, 'layers.css'), 'utf8'),
    'utf8',
  )

  console.log(`✓ Generated dist/atomic.css (${atomNames.length} atoms)`)
  console.log('✓ Generated dist/reset.css (self-layered)')
  console.log('✓ Copied index.css to dist/')
  console.log('✓ Copied no-tokens.css to dist/')
  console.log('✓ Copied layers.css to dist/')
}
