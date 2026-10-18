/**
 * The end-of-build scan: every CSS asset the build wrote is read for a surviving `@nave`, and one
 * left anywhere fails the build. It runs on the same finder as `navecss-core check` and prints the
 * same lines, so the build and the command agree on what survived. It has no off switch: a
 * directive in shipped CSS is never wanted, and `onUnknown: 'ignore'` does not turn it off.
 */
import type { BundleEntry } from './vite-types.ts'

import { type Finding, findingsInText, formatFinding } from './directive/findings.ts'

const decoder = new TextDecoder()

/**
 * Whether `entry` is a CSS file the build wrote.
 */
function isCssAsset(entry: BundleEntry): boolean {
  return entry.type === 'asset' && entry.fileName.toLowerCase().endsWith('.css')
}

/**
 * The text of an asset, whether Rollup holds it as a string or as bytes.
 */
function textOf(entry: BundleEntry): string {
  const { source } = entry
  if (source === undefined) return ''
  return typeof source === 'string' ? source : decoder.decode(source)
}

/**
 * The build error: a heading, one line per finding, and how many CSS files were read.
 */
export function scanMessage(findings: readonly Finding[], assetCount: number): string {
  const noun = assetCount === 1 ? 'asset' : 'assets'
  return [
    '@nave survived into the built CSS:',
    ...findings.map((finding) => formatFinding(finding)),
    `Scanned ${assetCount} CSS ${noun} this build wrote.`,
  ].join('\n')
}

/**
 * The CSS assets of `bundle` and every directive left in them.
 */
export function scanAssets(bundle: Readonly<Record<string, BundleEntry>>): {
  readonly findings: Finding[]
  readonly names: string[]
} {
  const assets = Object.values(bundle).filter((entry) => isCssAsset(entry))
  return {
    findings: assets.flatMap((asset) => findingsInText(asset.fileName, textOf(asset))),
    names: assets.map((asset) => asset.fileName),
  }
}
