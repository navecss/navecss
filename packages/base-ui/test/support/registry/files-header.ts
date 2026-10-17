/**
 * The two-line notice every copied file but `NAVECSS-LICENSE` opens with, rendered from the cleared
 * template with the year and holder `LICENSE` states, and the checks that read it in an item.
 */
import path from 'node:path'

import type { Problem } from './files-problem.ts'
import type { LoadedRegistry, RegistryItem } from './load.ts'

import { HEADER } from './cleared.ts'

export interface Notice {
  readonly holder: string
  readonly year: string
}

export const LICENSE_TARGET_NAME = 'NAVECSS-LICENSE'

const COPYRIGHT_LINE = /^Copyright \(c\) (\d{4}) (.+)$/m

/**
 * The year and holder of a `LICENSE`'s copyright line. Throws when it has none.
 */
export const parseNotice = (licenseText: string): Notice => {
  const match = COPYRIGHT_LINE.exec(licenseText)
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('the LICENSE has no line "Copyright (c) <year> <holder>"')
  }
  return { holder: match[2], year: match[1] }
}

export type HeaderKind = 'css' | 'ts'

/**
 * The header a file of the kind opens with: `// L1\n// L2\n`, or the same in block comments for CSS.
 */
export const headerFor = (kind: HeaderKind, notice: Notice): string => {
  const lines = [HEADER.line1, HEADER.line2(notice.year, notice.holder)]
  return kind === 'ts'
    ? lines.map((line) => `// ${line}\n`).join('')
    : lines.map((line) => `/* ${line} */\n`).join('')
}

export const headerKindOf = (target: string): HeaderKind | undefined => {
  if (target.endsWith('.css')) return 'css'
  return target.endsWith('.ts') ? 'ts' : undefined
}

export const isLicenseTarget = (target: string): boolean =>
  path.posix.basename(target) === LICENSE_TARGET_NAME

/**
 * The item's files that carry the header: every file but the licence.
 */
export const headed = (item: RegistryItem): RegistryItem['files'] =>
  item.files.filter((file) => !isLicenseTarget(file.target))

const headerProblem = (
  item: RegistryItem,
  file: RegistryItem['files'][number],
  notice: Notice,
): Problem[] => {
  const at = { file: file.target, item: item.name }
  const kind = headerKindOf(file.target)
  if (kind === undefined) return [{ ...at, message: 'a file of a type that has no header form' }]
  const content = file.content ?? ''
  const header = headerFor(kind, notice)
  const problems: Problem[] = []
  if (!content.startsWith(header)) {
    problems.push({ ...at, message: 'does not begin with the header for its type, byte for byte' })
  }
  const directive = content.indexOf("'use client'")
  if (directive !== -1 && directive < header.length) {
    problems.push({ ...at, message: "'use client' comes before the header" })
  }
  return problems
}

/**
 * Every file but the licence begins with the header for its type, before `'use client'`.
 */
export const headerProblems = (registry: LoadedRegistry, notice: Notice): Problem[] =>
  registry.items
    .values()
    .flatMap((item) => headed(item).flatMap((file) => headerProblem(item, file, notice)))
    .toArray()

/**
 * `NAVECSS-LICENSE` is the last file of every item, appears once, and is the licence's bytes.
 */
export const licenseProblems = (registry: LoadedRegistry, licenseText: string): Problem[] =>
  registry.items
    .values()
    .flatMap((item) => {
      const at = { file: LICENSE_TARGET_NAME, item: item.name }
      const licenses = item.files.filter((file) => isLicenseTarget(file.target))
      const last = item.files.at(-1)
      const problems: Problem[] = []
      if (licenses.length !== 1) {
        problems.push({ ...at, message: `${licenses.length} licence files, not one` })
      }
      if (last === undefined || !isLicenseTarget(last.target)) {
        problems.push({ ...at, message: 'is not the last file of the item' })
      }
      if (licenses.some((file) => file.content !== licenseText)) {
        problems.push({ ...at, message: 'is not the LICENSE bytes' })
      }
      return problems
    })
    .toArray()
