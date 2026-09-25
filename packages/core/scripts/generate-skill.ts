/**
 * Generates `packages/core/skills/navecss/SKILL.md`: one Agent Skills guide indexing Nave's
 * vocabulary for a consumer's coding agent. No agent (Claude Code, Codex, Cursor, Copilot)
 * discovers a file under `node_modules` on its own, so this file is reached only through a
 * pointer block the consumer pastes into their own `AGENTS.md` (R21) — never named `AGENTS.md`
 * itself, which inside THIS repository would be loaded unpointed-to by a contributor's own agent
 * working in `packages/core`.
 *
 * Source collection (everything that reads a real file or runs the tokens build) lives in
 * `generate-skill-sources.ts`; this file is rendering only. `generate()` takes its sources as
 * an optional argument (`SkillGuideSources`) rather than always collecting them itself, so a
 * test can run it against substituted sources (a planted atom, a changed description, a
 * mismatched light/dark pair) without touching the real tree.
 *
 * Run: node scripts/generate-skill.ts  (writes skills/navecss/SKILL.md)
 * Checked for drift by test/skill-guide-drift.test.ts, which imports `generate` and diffs it
 * against the committed file rather than re-deriving the rule.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

import type { SkillGuideSources } from './generate-skill-sources.ts'

import { renderDeclarations, renderVariants } from './generate-atoms-doc.ts'
import { collectRealSources } from './generate-skill-sources.ts'

export type { SkillGuideSources } from './generate-skill-sources.ts'
export {
  derivePaletteDescriptions,
  readDeclaredPropertyNames,
  readTokenDescriptions,
} from './generate-skill-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.resolve(HERE, '../skills/navecss/SKILL.md')
const CORE_README_PATH = path.resolve(HERE, '../README.md')

/**
 * The `button.module.css` fence core's own README teaches, read at generation time (never
 * transcribed), so the guide's one example can never drift from the README's.
 */
function readButtonFence(): string {
  const readme = readFileSync(CORE_README_PATH, 'utf8')
  const match = /```css\n(\/\* button\.module\.css \*\/[\s\S]*?)```/.exec(readme)
  if (!match) {
    throw new Error('generate-skill: could not find the button.module.css fence in README.md')
  }
  return match[1]!.trimEnd()
}

/**
 * The built-in atom table, grouped exactly as `ATOMS.md`'s own sections, plus `disabledState`'s
 * aria-disabled sentence (R23), named beside it in a "Notes" callout — mirroring `ATOMS.md`'s
 * own "Pairing notes" precedent — wherever its name or declarations appear, including its own
 * row above.
 */
function renderAtomsSection(sources: SkillGuideSources): string[] {
  const lines: string[] = [
    '## Atoms',
    '',
    'Every built-in atom: the name as written in `@nave` and `cx()`, the declarations it',
    'applies, and its pseudo-class, `@media` or `@container` variants. A name not on this list',
    'is not an atom — do not invent one.',
    '',
  ]
  for (const [section, names] of sources.sections) {
    lines.push(
      `### ${section}`,
      '',
      '| Atom | Declarations | Variants |',
      '| ---- | ------------ | -------- |',
    )
    for (const name of names) {
      const atom = sources.atomTable[name]!
      lines.push(
        `| \`${name}\` | ${renderDeclarations(atom.declarations)} | ${renderVariants(atom)} |`,
      )
    }
    lines.push('')
  }
  lines.push(
    '## Notes',
    '',
    '- `disabledState`: On the aria-disabled branch the element stays focusable by design: this ' +
      'atom only blocks pointer activation (pointer-events: none), so the component’s own ' +
      'activation handler must also check the attribute and no-op on Enter and Space, since CSS ' +
      'cannot prevent keyboard activation.',
    '',
  )
  return lines
}

/**
 * A markdown list, one bullet per `--nave-*` name, its description appended where one exists —
 * never a table: a markdown table pads every cell in a column to its widest cell, so the one
 * paragraph-length description among a hundred one-line entries would have padded every other
 * row to match it (measured: this alone pushed the guide well past the 32 KiB ceiling, R34).
 * A bare name with no description carries none — never a placeholder dash repeated a hundred
 * times, which is exactly the kind of composed-around-the-vocabulary text R2/R23 forbid.
 */
function renderCustomPropertiesSection(sources: SkillGuideSources): string[] {
  const lines: string[] = [
    '## Custom properties',
    '',
    'Every `--nave-*` custom property Nave declares, with its description where one exists. A',
    'name not on this list is not declared — an undeclared `--nave-*` name passes the build and',
    'renders nothing.',
    '',
  ]
  for (const name of sources.declaredPropertyNames) {
    const description = sources.tokenDescriptions.get(name) ?? sources.paletteDescriptions.get(name)
    lines.push(description === undefined ? `- \`${name}\`` : `- \`${name}\`: ${description}`)
  }
  lines.push('')
  return lines
}

/**
 * The layer order as an inline code span, deliberately never a fenced `css` block: the guide's
 * one `css` fence is the button example (AC-consumer-constraints-39), and a bare `@layer`
 * statement with no rule body is not itself a compilable stylesheet AC-38's PostCSS check could
 * meaningfully run over.
 */
function renderLayersSection(sources: SkillGuideSources): string[] {
  return [
    '## Layers',
    '',
    `Nave declares one \`@layer\` order, first, before any other stylesheet: \`${sources.layerStatement}\``,
    '',
    'Your own component CSS goes in `@layer components.consumer`; a deliberate exception goes in',
    '`@layer overrides`, which beats every other layer. A rule left outside any layer beats them',
    'all, `overrides` included — never write unlayered CSS.',
    '',
  ]
}

/**
`@nave`/`var(--nave-*)`: the primary idiom, presented first (AC-consumer-constraints-39).
 */
function renderNaveSection(): string[] {
  return [
    '## Using `@nave` and `var(--nave-*)`',
    '',
    'Apply built-in atoms with the `@nave` at-rule inside a CSS rule; read values through',
    '`var(--nave-*)`. Both vocabularies are closed sets: atom and `--nave-*` names are exactly',
    'the ones on this page. A name not on this page is not used — this guide says so rather than',
    'inventing one. An undeclared `--nave-*` name passes lint and the build and renders nothing.',
    '',
    '```css',
    readButtonFence(),
    '```',
    '',
    'Consumer rules go in `@layer components.consumer`, and a deliberate exception in',
    '`@layer overrides`; never write an unlayered rule. Atom names are the camelCase keys shown',
    'above (`focusRing`, `disabledState`), never the `nave-` class they emit.',
    '',
    'See where `@nave` is valid (nesting depth, `@media`/`@container`, `@keyframes`) in',
    '[the package README](../../README.md#where-nave-is-valid).',
    '',
  ]
}

/**
`cx()`: second (AC-consumer-constraints-39).
 */
function renderCxSection(): string[] {
  return [
    '## `cx()`',
    '',
    "The JavaScript escape hatch: `cx('interactive', 'focusRing')` resolves to the same",
    'built-in atoms `@nave` applies, type-checked against the same closed set. A type error from',
    '`cx()` means the name is wrong — it is never a reason to reach for `cx.raw()` or a cast.',
    '',
  ]
}

/**
`cx.raw()`: third (AC-consumer-constraints-39).
 */
function renderCxRawSection(): string[] {
  return [
    '## `cx.raw()`',
    '',
    '`cx.raw()` is for a class from outside any system Nave sees, the project’s own classes',
    "included. Where a project class shares an atom’s name, `cx('container')` is Nave’s atom and",
    "`cx.raw('container')` is the project’s class.",
    '',
    '`cx.raw()` is also for a CSS Module class behind a condition, shown by the code span',
    '`cx.raw(isActive && styles.active)`, because a template-literal slot interpolates a falsy',
    'condition’s own value — naming `false`, `undefined` and `0` — as a class.',
    '',
  ]
}

/**
 * Renders the full `SKILL.md` markdown, formatted with the repository's own Prettier config.
 * `sources` defaults to the real tree; a test passes its own to exercise a substitution without
 * touching it (AC-consumer-constraints-01, -33, -40).
 */
export async function generate(sources?: SkillGuideSources): Promise<string> {
  const real = sources ?? (await collectRealSources())
  const lines: string[] = [
    '---',
    'name: navecss',
    // Double-quoted: a YAML plain scalar cannot contain ": " (colon-space), which a bare
    // "Reference for Nave: ..." sentence does — an unquoted line here parses as a nested
    // mapping key instead of the description's own value.
    'description: "Reference for Nave — the @nave at-rule, cx()/cx.raw(), --nave-* custom',
    '  properties and the @layer order — so an agent applies existing atoms and tokens instead',
    '  of inventing new CSS."',
    '---',
    '',
    '# navecss',
    '',
    'An index of Nave’s vocabulary for a coding agent: every built-in atom, every `--nave-*`',
    'custom property, the layer order, and the idiom that applies them. See',
    '[ATOMS.md](../../ATOMS.md) for the same atom table alone, and',
    '[Theming](https://github.com/navecss/navecss/blob/main/README.md#theming) for how a project',
    'changes the seed colour and everything derived from it.',
    '',
    ...renderNaveSection(),
    ...renderCxSection(),
    ...renderCxRawSection(),
    ...renderAtomsSection(real),
    ...renderCustomPropertiesSection(real),
    ...renderLayersSection(real),
  ]

  const markdown = `${lines.join('\n').trimEnd()}\n`
  return format(markdown, {
    ...(await resolveConfig(OUTPUT_PATH)),
    parser: 'markdown',
  })
}

// Compare REALPATHS rather than a raw `file://` URL built from process.argv[1] (that older form
// silently writes nothing under a spaced or symlinked invocation path; see build-css.ts's isMain
// for the full rationale).
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

if (isMain) {
  writeFileSync(OUTPUT_PATH, await generate())
  console.log(`Wrote ${OUTPUT_PATH}`)
}
