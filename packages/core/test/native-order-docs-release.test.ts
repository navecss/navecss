/**
 * AC-native-apply-order-40, AC-native-apply-order-41 and the rest of AC-native-apply-order-46: the
 * agent guide gains its paragraph on order through its generator, and the release carries one
 * minor changeset for core and one patch changeset for base-ui, none with a slot or a private
 * reference.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { MIGRATION_VERSION, overriderSentence } from '../src/directive/migration.ts'
import { extractFences } from './doc-fences.ts'
import { scanForBrainReferences } from './helpers/brain-reference-scan.ts'
import { isEquivalent } from './helpers/css-equivalence.ts'
import {
  adrRecord,
  CHANGELOG_PATH,
  CHANGESET_DIR,
  expandedByPlugin,
  expansionPairs,
  fold,
  placeholdersIn,
  readCore,
  withoutCodeSpans,
} from './helpers/native-order-docs.ts'
import { shippedChangesetProse } from './helpers/released-changeset.ts'

const guide = readFileSync(OUTPUT_PATH, 'utf8')

const GUIDE_PARAGRAPH =
  "`@nave a b;` expands in place, atom by atom, each atom's pseudo-class, `@media` and `@container` blocks right after its declarations, and what the rule says after the directive comes after all of it. A later declaration overrides an atom's declarations and its `@media` and `@container` blocks. Over a pseudo-class block, such as the `:focus-visible` of `focusRing`, a later nested block such as `&:focus { ... }` wins too, but a plain declaration does not, because the block's selector is more specific. Name responsive and state atoms (`hide*`, `*PhoneOnly`, `focusRing`) after the atoms they adjust, and write a declaration that should give way to them above the directive. When the build warns that something later in the rule overrides an atom's block, reorder; add a `nave-allow-override` marker only when the override is what the task asks for."

describe('AC-native-apply-order-40: the agent guide gains the paragraph on order', () => {
  it('the generator writes the committed guide', async () => {
    expect(await generate()).toBe(guide)
  })

  it('holds the paragraph after the camelCase paragraph and before the pointer to where @nave is valid', () => {
    const text = fold(guide)

    expect(text).toContain(GUIDE_PARAGRAPH)
    expect(text.indexOf(GUIDE_PARAGRAPH)).toBeGreaterThan(
      text.indexOf('Atom names are the camelCase keys'),
    )
    expect(text.indexOf(GUIDE_PARAGRAPH)).toBeLessThan(text.indexOf('See where `@nave` is valid'))
  })

  it('names the order, the atoms to name last and that a marker is for an override the task asks for', () => {
    expect(fold(guide)).toContain('expands in place, atom by atom')
    expect(fold(guide)).toContain('after the atoms they adjust')
    expect(fold(guide)).toContain('only when the override is what the task asks for')
  })

  it('shows no expansion, and no ring in a sentence about a marker', () => {
    expect(expansionPairs(guide)).toEqual([])
    const sentences = fold(guide)
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.includes('marker'))

    expect(sentences.length).toBeGreaterThan(0)
    for (const sentence of sentences) expect(withoutCodeSpans(sentence)).not.toMatch(/\bring\b/i)
  })
})

/**
 * The two changesets the release adds: where each lives and the words its text opens with, which
 * is how its changelog entry is found once the release has consumed the file.
 */
const CORE_CHANGESET = {
  path: path.join(CHANGESET_DIR, 'nave-expands-in-native-order.md'),
  entryStart: '`@nave` now expands in the order CSS mixins will apply it',
}
const BASE_UI_CHANGESET = {
  path: path.join(CHANGESET_DIR, 'base-ui-stylesheet-in-native-order.md'),
  entryStart: "The built stylesheet's bytes change and no computed value does.",
}

const prose = (changeset: typeof CORE_CHANGESET): string =>
  fold(shippedChangesetProse(changeset.path, CHANGELOG_PATH, changeset.entryStart))

/**
 * The names of the functions a text calls in a code span, as `name()`.
 */
function namesCalledIn(text: string): string[] {
  return text
    .matchAll(/`([A-Za-z]\w*)\(\)`/g)
    .map((match) => match[1]!)
    .toArray()
}

/**
 * Every name a subpath of the package exports from JavaScript: the entries `package.json` points
 * `exports` at, found in the build configuration, and the names their sources export.
 */
function exportedNames(): string[] {
  const root = path.resolve(path.dirname(OUTPUT_PATH), '../..')
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>
  }
  const targets = JSON.stringify(manifest.exports).match(/\.\/dist\/(\w+)\.js/g) ?? []
  const wanted = new Set(targets.map((target) => /dist\/(\w+)\.js/.exec(target)![1]!))
  const config = readFileSync(path.join(root, 'tsup.config.ts'), 'utf8')
  const entries = config
    .matchAll(/(\w+): '(src\/[^']+)'/g)
    .filter((match) => wanted.has(match[1]!))
    .toArray()
  expect(entries.length).toBeGreaterThan(3)
  return entries.flatMap((match) => {
    const source = readFileSync(path.join(root, match[2]!), 'utf8')
    return source
      .matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)
      .map((named) => named[1]!)
      .toArray()
  })
}

/**
 * The pending changesets that open with `entryStart` and name `package@bump`.
 */
function pendingNaming(entryStart: string, bump: string): string[] {
  return readdirSync(CHANGESET_DIR)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .filter((name) => {
      const text = readFileSync(path.join(CHANGESET_DIR, name), 'utf8')
      return text.includes(bump) && fold(text.replace(/^---[\s\S]*?---/, '')).startsWith(entryStart)
    })
}

describe('AC-native-apply-order-41: one minor changeset for core and a patch for base-ui', () => {
  it('exactly one changeset names core at minor and opens with the order, pending or released', () => {
    const pending = pendingNaming(CORE_CHANGESET.entryStart, "'@navecss/core': minor")

    expect(pending).toEqual(
      existsSync(CORE_CHANGESET.path) ? [path.basename(CORE_CHANGESET.path)] : [],
    )
    expect(prose(CORE_CHANGESET)).toContain(CORE_CHANGESET.entryStart)
  })

  it('names core alone in its front matter', () => {
    if (!existsSync(CORE_CHANGESET.path)) return
    const head = /^---\n([\s\S]*?)\n---/.exec(readFileSync(CORE_CHANGESET.path, 'utf8'))![1]

    expect(head).toBe("'@navecss/core': minor")
  })

  it('holds the paragraphs of the release: the order, the two shapes with their fixes, the warning, the marker, the wrap, the licence line', () => {
    const text = prose(CORE_CHANGESET)

    expect(text).toContain(
      "each atom's declarations, then that atom's own pseudo-class, `@media` and `@container` blocks",
    )
    expect(text).toContain(
      '`@nave hideDesktopUp flex;` used to hide the element from 75em up, and now shows it as flex',
    )
    expect(text).toContain('Name the responsive atom last: `@nave flex hideDesktopUp;`.')
    expect(text).toContain('Move the declaration above the directive to keep the old result.')
    expect(text).toContain(
      'It never fails the build, `onUnknown` does not change it, and no option turns it off.',
    )
    expect(text).toContain('`@nave /* nave-allow-override: display */ hideDesktopUp;`')
    expect(text).toContain('Declarations that now follow a nested block are written inside `& { }`')
    expect(text).toContain('`dist/atomic.css` and `cx()` are unchanged.')
    expect(text).toContain(
      '`LICENSE` now also credits mdn-data and the CSS specifications that the property table behind the warning is derived from.',
    )
  })

  it('names no function that no subpath of the package exports, and says what the result was before as the warning does', () => {
    const text = prose(CORE_CHANGESET)

    expect(namesCalledIn(text)).toContain('cx')
    for (const name of namesCalledIn(text)) {
      expect(exportedNames(), `the changeset names ${name}() but no subpath exports it`).toContain(
        name,
      )
    }
    expect(text).toContain(overriderSentence('hideDesktopUp'))
    expect(text).toContain(`Before @navecss/core ${MIGRATION_VERSION}`)
  })

  it('control: a sentence naming expandText() is caught, because no subpath exports it', () => {
    const planted = 'The result of `expandText()` carries the warnings in a new field, `warnings`.'

    expect(namesCalledIn(planted)).toEqual(['expandText'])
    expect(exportedNames()).not.toContain('expandText')
  })

  it('exactly one changeset names base-ui at patch for its stylesheet, saying bytes change and no computed value does', () => {
    const pending = pendingNaming(BASE_UI_CHANGESET.entryStart, "'@navecss/base-ui': patch")

    expect(pending).toEqual(
      existsSync(BASE_UI_CHANGESET.path) ? [path.basename(BASE_UI_CHANGESET.path)] : [],
    )
    expect(prose(BASE_UI_CHANGESET)).toMatch(/bytes change and no computed value does/)
  })

  it("says of the base-ui stylesheet that `focusRing`'s `outline: none` moves, and not that every role changes", () => {
    expect(prose(BASE_UI_CHANGESET)).toContain(
      fold(
        "The built stylesheet's bytes change and no computed value does. `@navecss/base-ui/styles.css` is built through `@nave`, which now expands each atom where the directive is written, so where a role has blocks of its own, `focusRing`'s `outline: none` moves: it now sits in an `& { }` rule after those blocks. What a page shows is the same.",
      ),
    )
  })

  it('holds no private reference, slot or placeholder', () => {
    for (const changeset of [CORE_CHANGESET, BASE_UI_CHANGESET]) {
      const text = shippedChangesetProse(changeset.path, CHANGELOG_PATH, changeset.entryStart)
      scanForBrainReferences(text, path.basename(changeset.path))

      expect(placeholdersIn(text)).toEqual([])
    }
  })
})

describe('AC-native-apply-order-46: nothing the release ships keeps a slot or a placeholder', () => {
  it('the guide, the consumer doc, the licence and the records hold no [[SLOT and no unfilled placeholder', () => {
    const texts = [
      guide,
      readCore('CONSUMER-ATOMS.md'),
      readCore('LICENSE'),
      readCore('src/directive/property-table.generated.ts').split('\n', 1)[0]!,
      adrRecord('0011').text,
    ]

    for (const text of texts) expect(placeholdersIn(text)).toEqual([])
  })

  it('no source that prints a warning leaves a slot or a placeholder in its text', () => {
    const directory = path.join(path.dirname(OUTPUT_PATH), '../../src/directive')
    const files = readdirSync(directory).filter((name) =>
      /^(order-|migration|marker-names)/.test(name),
    )

    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = readFileSync(path.join(directory, file), 'utf8')
      expect(placeholdersIn(source), file).toEqual([])
    }
  })

  it('every expansion fence of the guide is the plugin output, and the guide has none', async () => {
    for (const { output, source } of expansionPairs(guide)) {
      expect(isEquivalent(await expandedByPlugin(source), output)).toBe(true)
    }
    expect(extractFences('SKILL.md', guide).filter((fence) => fence.lang === 'css')).toHaveLength(1)
  })
})
