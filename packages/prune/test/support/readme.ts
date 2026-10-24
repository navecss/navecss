/**
 * Reading a README as the tests need it: its headings outside code fences, the section under each,
 * its fenced blocks, and GitHub's slug for a heading.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const PACKAGE_DIR = path.resolve(import.meta.dirname, '../..')
export const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')

export interface Heading {
  readonly level: number
  /**
   * The heading's text with its inline code marks removed.
   */
  readonly title: string
  readonly line: number
}

export interface Fence {
  readonly language: string
  readonly body: string
  /**
   * The line of the opening fence, 0-based.
   */
  readonly line: number
}

export const readmeOf = (directory: string): string =>
  readFileSync(path.join(directory, 'README.md'), 'utf8')

/**
 * Every line of `readme` with whether it lies inside a fenced block.
 */
function linesOutsideFences(readme: string): { isFenced: boolean; text: string }[] {
  let isFenced = false
  return readme.split('\n').map((text) => {
    if (text.startsWith('```')) {
      isFenced = !isFenced
      return { text, isFenced: true }
    }
    return { text, isFenced }
  })
}

/**
 *
 */
export function headingsOf(readme: string): Heading[] {
  return linesOutsideFences(readme).flatMap(({ text, isFenced }, line) => {
    const match = /^(#{1,6}) (.+)$/u.exec(text)
    return isFenced || !match
      ? []
      : [{ level: match[1]!.length, title: match[2]!.replaceAll('`', ''), line }]
  })
}

/**
 *
 */
export function fencesOf(readme: string): Fence[] {
  const lines = readme.split('\n')
  const fences: Fence[] = []
  for (let at = 0; at < lines.length; at += 1) {
    const open = /^```(\S*)/u.exec(lines[at]!)
    if (open === null) continue
    const close = lines.findIndex((text, index) => index > at && text.startsWith('```'))
    fences.push({ language: open[1]!, body: lines.slice(at + 1, close).join('\n'), line: at })
    at = close
  }
  return fences
}

/**
 * GitHub's anchor for a heading: lower case, punctuation removed, spaces as hyphens.
 */
export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replaceAll(/\s/gu, '-')
}

/**
 * The text of the section a heading opens: up to the next heading of the same or a higher level.
 */
export function sectionOf(readme: string, headings: readonly Heading[], title: string): string {
  const index = headings.findIndex((heading) => heading.title === title)
  if (index === -1) return ''
  const start = headings[index]!
  const end = headings.slice(index + 1).find((heading) => heading.level <= start.level)
  const lines = readme.split('\n')
  return lines.slice(start.line + 1, end === undefined ? lines.length : end.line).join('\n')
}

/**
 * Every in-page link target (`](#anchor)`) outside code fences that no heading has the slug of.
 */
export function brokenAnchors(readme: string): string[] {
  const slugs = new Set(headingsOf(readme).map((heading) => slugOf(heading.title)))
  const prose = linesOutsideFences(readme)
    .filter(({ isFenced }) => !isFenced)
    .map(({ text }) => text)
    .join('\n')
  return prose
    .matchAll(/\]\(#([^)\s]+)\)/gu)
    .map((match) => match[1]!)
    .filter((anchor) => !slugs.has(anchor))
    .toArray()
}
