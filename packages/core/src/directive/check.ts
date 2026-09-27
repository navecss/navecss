/**
 * R10: `check({ source })`, the core logic behind both the `navecss-core
 * check` bin and the `@navecss/core/check` subpath. Exit contract mirrors
 * `navecss-tokens`: `0` read at least one stylesheet and found none, `1`
 * found at least one, `2` a usage error, an unreadable path, or no
 * stylesheet found at all.
 */
import { readFile } from 'node:fs/promises'

import { createPositionFinder } from './expand-text-diagnostics.ts'
import { findSurvivors } from './find-survivors.ts'
import { listCssFiles, type PathListing } from './list-css-files.ts'

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

/**
Reads `file` and appends one `Finding` per surviving directive it holds.
 */
async function checkFile(file: string, findings: Finding[]): Promise<void> {
  const raw = await readFile(file, 'utf8')
  // A leading BOM (Node's utf8 decoding keeps it as a literal U+FEFF, unlike
  // a `TextDecoder` set to strip one) is not part of the stylesheet's own
  // content: left in, it shifts every reported column by one relative to
  // what the file actually looks like once opened in an editor that hides it.
  const css = raw.startsWith('\u{FEFF}') ? raw.slice(1) : raw
  // Built once per file, not once per survivor: a fresh linear scan per
  // query made a large stylesheet with many directives quadratic in its
  // own size (AC-25).
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
}

/**
A single `--source` entry's files, or `undefined` when the path could not be read at all.
 */
async function sourceFiles(source: string): Promise<PathListing | undefined> {
  try {
    return await listCssFiles(source)
  } catch {
    return undefined
  }
}

/**
`check({ source })`: reads every stylesheet under `source`, reporting every surviving `@nave`.
 */
export async function check(options: CheckOptions): Promise<CheckResult> {
  const findings: Finding[] = []
  let stylesheetsRead = 0
  let hasUnreadableSource = false

  for (const source of options.source) {
    const listing = await sourceFiles(source)
    if (!listing) {
      hasUnreadableSource = true
      continue
    }
    for (const file of listing.files) {
      await checkFile(file, findings)
      stylesheetsRead++
    }
  }

  const status = statusFor(hasUnreadableSource, stylesheetsRead, findings.length)
  return { status, findings, stylesheetsRead }
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
