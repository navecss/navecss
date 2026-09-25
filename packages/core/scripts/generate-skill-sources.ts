/**
 * Data collection for `generate-skill.ts`: everything that reads a real file off disk or runs
 * the tokens build, split out of the rendering module purely to keep each file under this
 * repository's line-count lint (the same split `build-css.ts`/`formats.ts` already model).
 *
 * Reads Nave's vocabulary through `@navecss/tokens`'s public `exports` map only, never a path
 * into that package's own source tree (R20, Q11): non-colour token names and `$description`s
 * from the `./tokens.json` export, colour-slot names and `$description`s from the
 * `palette-record.json` the exported `./build` API's `build()` writes into a temporary
 * directory THIS module creates and owns (never a directory the tokens package would own
 * itself), and the full `--nave-*` name set from the built `./css` output (the closed set: no
 * primitive, since no primitive is emitted). Atoms and the layer order come from this package's
 * own `src/`, exactly as `generate-atoms-doc.ts` and `generate-css-data.ts` already read them.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AtomDefinition, AtomName } from '../src/atoms.ts'

import { atoms } from '../src/atoms.ts'
import { readSections } from './generate-atoms-doc.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LAYERS_CSS_PATH = path.resolve(HERE, '../src/layers.css')

export interface SkillGuideSources {
  /**
  Section name → the atom names it lists, in source order (readSections()'s own shape).
   */
  sections: ReadonlyMap<string, readonly AtomName[]>
  /**
  The live atom table, or a test's modified copy sharing `sections`'s key set.
   */
  atomTable: Record<string, AtomDefinition>
  /**
  Non-colour custom-property name → `$description`, read from `./tokens.json`.
   */
  tokenDescriptions: ReadonlyMap<string, string>
  /**
  Every `--nave-*` name the build emits, read from the built `./css` output.
   */
  declaredPropertyNames: readonly string[]
  /**
  Colour custom-property name → `$description`, derived from `palette-record.json`.
   */
  paletteDescriptions: ReadonlyMap<string, string>
  /**
  The raw `@layer` order statement, read from `src/layers.css`.
   */
  layerStatement: string
}

/**
 * A camelCase segment (a DTCG path component, e.g. `lineHeight`) to its kebab-case CSS form
 * (`line-height`) — the transform `@navecss/tokens`'s own build already applies when it
 * composes a `--nave-*` name, re-derived here because that transform is not itself exported.
 */
function kebab(segment: string): string {
  return segment.replaceAll(/([A-Z])/g, '-$1').toLowerCase()
}

/**
 * Reads a package export's resolved file path through Node's own resolver
 * (`import.meta.resolve`), never a relative path into the other package — the same route
 * `facade.ts`'s `resolveInstalledCoreVersion` uses to reach `@navecss/core`'s own manifest.
 */
function resolveExport(specifier: string): string {
  return fileURLToPath(import.meta.resolve(specifier))
}

/**
 * Every leaf token in the `./tokens.json` DTCG source that carries a `$description`, as a
 * `--nave-*` name → description map. Skips `breakpoint.*` (not emitted as a custom property, a
 * separate JS export) and any path with an underscore-prefixed segment (`_primitive.*`, DTCG's
 * own private-token convention — filtered from the build's public CSS output, so a name derived
 * from it would not be in `declaredPropertyNames` either).
 */
export function readTokenDescriptions(): Map<string, string> {
  const raw = readFileSync(resolveExport('@navecss/tokens/tokens.json'), 'utf8')
  const doc: unknown = JSON.parse(raw)
  const result = new Map<string, string>()

  /**
  Walks the DTCG tree, collecting a `--nave-*` name → `$description` entry at each leaf.
   */
  function walk(node: unknown, segments: string[]): void {
    if (node === null || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if ('$value' in obj) {
      if (segments[0] === 'breakpoint' || segments.some((s) => s.startsWith('_'))) return
      const description = obj.$description
      if (typeof description === 'string') {
        result.set(`--nave-${segments.map((s) => kebab(s)).join('-')}`, description)
      }
      return
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$')) continue
      walk(value, [...segments, key])
    }
  }

  walk(doc, [])
  return result
}

/**
 * Every `--nave-*` custom property the build actually declares (a value declaration, `name:
 * value;`, present for every property whether or not it also carries an `@property` rule) —
 * read from the built `./css` output, the closed set AC-consumer-constraints-33 checks against.
 */
export function readDeclaredPropertyNames(): string[] {
  const css = readFileSync(resolveExport('@navecss/tokens/css'), 'utf8')
  const names = new Set<string>()
  for (const match of css.matchAll(/(--nave-[\w-]+)\s*:/g)) names.add(match[1]!)
  return [...names].toSorted((a, b) => a.localeCompare(b))
}

const PALETTE_RECORD_KEY = /^color\.(.+)\.(light|dark)$/

/**
 * Parses a `palette-record.json` document (`composePaletteRecord`'s own shape: `color.<slot>.
 * <branch>` entries, `$description` present only where `SLOT_DESCRIPTIONS` names the base slot)
 * into a `--nave-color-*` name → description map. **Throws, naming the slot, if a slot's light
 * and dark entries disagree on their description** — they are composed from the SAME
 * `SLOT_DESCRIPTIONS` lookup keyed on the base slot, so a disagreement is a defect in the record
 * this generator was handed, not a legitimate per-branch difference to render.
 */
export function derivePaletteDescriptions(record: Record<string, unknown>): Map<string, string> {
  const byBranch = new Map<string, { dark?: string; light?: string }>()
  for (const [key, value] of Object.entries(record)) {
    const match = PALETTE_RECORD_KEY.exec(key)
    if (!match) continue
    const slot = match[1]!
    const branch = match[2] as 'dark' | 'light'
    const description = (value as { $description?: string }).$description
    const bucket = byBranch.get(slot) ?? {}
    if (description !== undefined) bucket[branch] = description
    byBranch.set(slot, bucket)
  }

  const result = new Map<string, string>()
  for (const [slot, { light, dark }] of byBranch) {
    if (light !== dark) {
      throw new Error(
        `generate-skill: palette record slot "${slot}" disagrees between its light description ` +
          `(${JSON.stringify(light)}) and its dark description (${JSON.stringify(dark)})`,
      )
    }
    if (light !== undefined) result.set(`--nave-color-${slot.replaceAll('.', '-')}`, light)
  }
  return result
}

/**
 * Runs the real `@navecss/tokens` build once, into a temporary directory THIS function creates
 * and removes, and returns the parsed `palette-record.json` it wrote there. The seed is Nave's
 * own shipped primary tint (`shipped-seeds.ts`'s value, as a CSS colour string): every
 * `$description` in the record is seed-independent (keyed on the base slot, never the resolved
 * colour), so any accepted seed produces the same descriptions — this one is used only so the
 * build's other refusal paths see a real, in-range value.
 */
async function buildPaletteRecord(): Promise<Record<string, unknown>> {
  const { build } = await import('@navecss/tokens/build')
  const outDir = mkdtempSync(path.join(tmpdir(), 'nave-skill-guide-'))
  try {
    await build({ seed: 'oklch(0.7859 0.1316 186.17)', outDir })
    const raw = readFileSync(path.join(outDir, 'palette-record.json'), 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/**
 * The real `@layer` order statement, as `src/layers.css` declares it — the same file
 * `@navecss/core/layers` publishes unchanged (confirmed byte-identical to `dist/layers.css`).
 */
function readLayerStatement(): string {
  const css = readFileSync(LAYERS_CSS_PATH, 'utf8')
  // Anchored to the START of a line: the docblock above the real statement itself says
  // "the @layer order statement, alone" in prose, and an unanchored scan would greedily
  // match from that first mid-comment occurrence through to the real statement's semicolon,
  // swallowing the whole comment block into the "layer order" this generator renders.
  const match = /^@layer\s+[^;]+;/m.exec(css)
  if (!match) throw new Error('generate-skill: could not find the @layer statement in layers.css')
  return match[0]
}

/**
 * Collects every real source `generate()` needs, in one call. A test bypasses this entirely by
 * passing its own `SkillGuideSources` to `generate()` directly.
 */
export async function collectRealSources(): Promise<SkillGuideSources> {
  const [tokenDescriptions, paletteRecord] = await Promise.all([
    Promise.resolve(readTokenDescriptions()),
    buildPaletteRecord(),
  ])
  return {
    sections: readSections(),
    atomTable: atoms,
    tokenDescriptions,
    declaredPropertyNames: readDeclaredPropertyNames(),
    paletteDescriptions: derivePaletteDescriptions(paletteRecord),
    layerStatement: readLayerStatement(),
  }
}
