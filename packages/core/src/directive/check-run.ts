/**
 * The shared walk behind both `check()` (`check.ts`, the public
 * `@navecss/core/check` entry) and the `navecss-core check` bin: one pass
 * over `--source`, from which the bin derives every unreadable path it
 * prints without a second, redundant walk of the same directories. Kept out
 * of `check.ts` itself so `runCheck`'s richer return shape — the bin's own
 * concern, not the public one — never becomes part of that subpath's export
 * surface.
 */
import { readFile } from 'node:fs/promises'

import { createPositionFinder } from './expand-text-diagnostics.ts'
import { findSurvivors } from './find-survivors.ts'
import { listCssFiles, NotAStylesheetPathError, type PathListing } from './list-css-files.ts'

export interface CheckOptions {
  readonly source: readonly string[]
}

export interface Finding {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly text: string
  readonly selector?: string
}

export interface CheckResult {
  readonly status: 0 | 1 | 2
  readonly findings: readonly Finding[]
  readonly stylesheetsRead: number
}

export interface CheckRun {
  readonly result: CheckResult
  /**
  Every path this run could not read at all: a `--source` value itself, a subdirectory found unreadable while recursing, or a listed file that failed to read — in that order, per source, in the order `options.source` gave them.
   */
  readonly unreadablePaths: readonly string[]
  /**
  Every `--source` value naming something that is neither a directory nor a regular file (a FIFO, socket or device), refused before any read was attempted.
   */
  readonly notStylesheetPaths: readonly string[]
}

/**
 * Reads `file` and appends one `Finding` per surviving directive it holds.
 * `false` when `file` itself could not be read (a mode-000 file passed
 * directly, or one found readable at listing time but not by the time this
 * runs): the caller counts that against the exit status without letting it
 * stop the rest of the run, the same way an unreadable `--source` path does.
 */
async function wasFileRead(file: string, findings: Finding[]): Promise<boolean> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return false
  }
  // A leading BOM (Node's utf8 decoding keeps it as a literal U+FEFF, unlike
  // a `TextDecoder` set to strip one) is not part of the stylesheet's own
  // content: left in, it shifts every reported column by one relative to
  // what the file actually looks like once opened in an editor that hides it.
  const css = raw.startsWith('\u{FEFF}') ? raw.slice(1) : raw
  // Built once per file, not once per query: a fresh linear scan per
  // query made a large stylesheet with many directives quadratic in its
  // own size.
  const positionAt = createPositionFinder(css)
  for (const survivor of findSurvivors(css)) {
    const position = positionAt(survivor.offset)
    findings.push({
      file,
      line: position.line,
      column: position.column + 1,
      text: survivor.text,
      ...(survivor.selector !== undefined && { selector: survivor.selector }),
    })
  }
  return true
}

type SourceOutcome =
  | { readonly kind: 'listing'; readonly listing: PathListing }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'not-a-stylesheet' }

/**
A single `--source` entry's files, or why it produced none: unreadable (could not be statted or listed at all) or not a stylesheet file (a FIFO, socket or device, refused before any read was attempted).
 */
async function sourceOutcome(source: string): Promise<SourceOutcome> {
  try {
    return { kind: 'listing', listing: await listCssFiles(source) }
  } catch (error) {
    if (error instanceof NotAStylesheetPathError) return { kind: 'not-a-stylesheet' }
    return { kind: 'unreadable' }
  }
}

/**
`2` on a usage/read error or nothing read at all; `1` when something survived; `0` on a clean read.
 */
function statusFor(
  hasUnreadableSource: boolean,
  stylesheetsRead: number,
  findingCount: number,
): 0 | 1 | 2 {
  if (hasUnreadableSource || stylesheetsRead === 0) return 2
  return findingCount > 0 ? 1 : 0
}

/**
 * `runCheck(source)`: the one walk behind `check()` and the bin, at once.
 * Reads every stylesheet under every `--source` entry, reporting every
 * surviving `@nave` (`result`) and every path this pass could not read at
 * all (`unreadablePaths`) — the bin's own printed lines, derived here
 * rather than by walking the same directories again to find them.
 */
export async function runCheck(source: readonly string[]): Promise<CheckRun> {
  const findings: Finding[] = []
  const unreadablePaths: string[] = []
  const notStylesheetPaths: string[] = []
  let stylesheetsRead = 0
  let hasUnreadableSource = false

  for (const one of source) {
    const outcome = await sourceOutcome(one)
    if (outcome.kind === 'unreadable') {
      hasUnreadableSource = true
      unreadablePaths.push(one)
      continue
    }
    if (outcome.kind === 'not-a-stylesheet') {
      hasUnreadableSource = true
      notStylesheetPaths.push(one)
      continue
    }
    const listing = outcome.listing
    if (listing.unreadablePaths.length > 0) {
      hasUnreadableSource = true
      unreadablePaths.push(...listing.unreadablePaths)
    }
    for (const file of listing.files) {
      const wasReadable = await wasFileRead(file, findings)
      if (wasReadable) {
        stylesheetsRead++
      } else {
        hasUnreadableSource = true
        unreadablePaths.push(file)
      }
    }
  }

  const status = statusFor(hasUnreadableSource, stylesheetsRead, findings.length)
  return { result: { status, findings, stylesheetsRead }, unreadablePaths, notStylesheetPaths }
}
