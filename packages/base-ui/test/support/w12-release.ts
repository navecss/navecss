/**
 * What the release of the seven components is read from: the changesets that name the package, and
 * the two ADR decisions that said the stylesheet sets no `z-index`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from './stylesheet.ts'

export const ROOT = path.join(PACKAGE_DIR, '../..')

/**
The releases a changeset's frontmatter names, package name to bump, quoted or not.
 */
export const releasesOf = (text: string): Record<string, string> => {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  return Object.fromEntries(
    frontmatter
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const match = /^\s*(['"]?)(.+?)\1\s*:\s*(\S+)\s*$/.exec(line)
        return [match?.[2] ?? line, match?.[3] ?? '']
      }),
  )
}

export interface Changeset {
  readonly file: string
  readonly releases: Record<string, string>
  readonly text: string
}

/**
The pending changesets that name a package, with their text.
 */
export const changesetsNaming = (name: string): Changeset[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => {
      const text = readFileSync(path.join(ROOT, '.changeset', file), 'utf8')
      return { file, releases: releasesOf(text), text }
    })
    .filter(({ releases }) => Object.hasOwn(releases, name))

/**
The text of a section of a document, from the first line that matches `from` up to the first later
line that matches `to` (the end of the document when none does).
 */
export const sectionOf = (text: string, from: RegExp, to: RegExp): string => {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => from.test(line))
  if (start === -1) {
    return ''
  }
  const length = lines.slice(start + 1).findIndex((line) => to.test(line))
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join('\n')
}

/**
The first date the correction may carry: the day the spec was approved and the placement signed.
 */
export const EARLIEST_CORRECTION = '2026-10-14'

const CORRECTION =
  /^- \*\*Correction \((\d{4}-\d{2}-\d{2})\):\*\*[\s\S]*?(?=\n- |\n\n(?=\S)|(?![\s\S]))/gm

/**
The dated correction bullets of a decision.
 */
export const correctionsOf = (decision: string): { date: string; text: string }[] =>
  decision
    .matchAll(CORRECTION)
    .map((match) => ({ date: match[1] ?? '', text: match[0].replaceAll(/\s+/g, ' ') }))
    .toArray()

const NAMES_THE_DECLARATION =
  /`?z-index`?[^.]*`?--nave-layer-toast`?|`--nave-layer-toast`[^.]*`?z-index`?/
const NO_LAYER_MOVES =
  /\bno layer\b[^.]*\b(?:moves?|moved|renamed|reordered|changes?|changed|inserted|removed)\b/i

/**
What is wrong with one dated correction about the `z-index`.
 */
const correctionProblems = ({ date, text }: { date: string; text: string }): string[] => [
  ...(date < EARLIEST_CORRECTION
    ? [`the correction is dated ${date}, before ${EARLIEST_CORRECTION}`]
    : []),
  ...(NAMES_THE_DECLARATION.test(text)
    ? []
    : ['the correction does not name z-index with --nave-layer-toast']),
  ...(/toast-placement|toast area/i.test(text)
    ? []
    : ['the correction does not name the toast placement']),
  ...(NO_LAYER_MOVES.test(text) ? [] : ['the correction does not say that no layer moves']),
]

/**
What is wrong with one ADR decision about the stylesheet's `z-index`. A decision that still says the
stylesheet sets none must carry a dated correction that names the one admitted declaration and says
no layer moves. A decision with no such correction must itself name the declaration.
 */
export const zIndexProblems = (
  decision: string,
  { needsCorrection }: { needsCorrection: boolean },
): string[] => {
  const corrections = correctionsOf(decision).filter(({ text }) => text.includes('z-index'))
  const isClaimed = needsCorrection || decision.includes('sets no `z-index`')
  return [
    ...(isClaimed && corrections.length === 0 ? ['no dated correction about the z-index'] : []),
    ...corrections.flatMap((correction) => correctionProblems(correction)),
    ...(corrections.length === 0 && !NAMES_THE_DECLARATION.test(decision.replaceAll(/\s+/g, ' '))
      ? ['the decision does not name the admitted z-index declaration']
      : []),
  ]
}

export const SEVEN_COMPONENTS = [
  'Toast',
  'Navigation Menu',
  'Scroll Area',
  'Meter',
  'Progress',
  'Avatar',
  'Separator',
]

/**
Whether a changeset's text names all seven components of the release.
 */
export const hasTheSeven = (text: string): boolean =>
  SEVEN_COMPONENTS.every((component) => new RegExp(component, 'i').test(text))

export const SIX_SUBPATHS = [
  'alert-dialog',
  'context-menu',
  'menubar',
  'preview-card',
  'combobox',
  'autocomplete',
]

/**
Whether a changeset's text names the six subpaths of the release before the seven.
 */
export const hasTheSix = (text: string): boolean =>
  SIX_SUBPATHS.every((subpath) => text.includes(subpath))

/**
Whether a changeset is about one of the two releases the clause below holds: the six or the seven.
 */
export const isAboutTheReleases = ({ text }: Changeset): boolean =>
  hasTheSix(text) || hasTheSeven(text)

/**
What is wrong with the pending changesets that name a package, among those about the two releases:
each must name it alone with bump `minor`, and exactly one of them, the pull request's own, must
name the seven components. A changeset about neither, such as a later fix, is outside the clause,
and with none about either pending there is nothing to hold.
 */
export const changesetProblems = (pending: readonly Changeset[], name: string): string[] => {
  const about = pending.filter((changeset) => isAboutTheReleases(changeset))
  if (about.length === 0) {
    return []
  }
  return [
    ...about
      .filter(({ releases }) => Object.keys(releases).length !== 1 || releases[name] !== 'minor')
      .map(({ file }) => `${file} does not name ${name} alone with bump minor`),
    ...(about.filter(({ text }) => hasTheSeven(text)).length === 1
      ? []
      : ['not exactly one pending changeset names the seven components']),
  ]
}
