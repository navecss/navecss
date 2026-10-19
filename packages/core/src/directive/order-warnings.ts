/**
 * Turns the findings of the order check into the warnings a host reports, applying each
 * directive's marker: a finding whose overridden longhands the marker covers is silent, one it
 * covers in part names only what is left, and a marker that covers nothing, names no property or
 * is not a marker at all is itself reported.
 */
import type { DirectiveFacts, Finding } from './order-model.ts'
import type { PlanWarning } from './rule-model.ts'

import { namesForLonghands } from './marker-names.ts'
import { coveredLonghands, longhandsCoveredBy, type Marker, readMarkers } from './order-marker.ts'
import { lastOverriderIndex } from './order-moves.ts'
import { overriddenLonghands } from './order-overridden.ts'
import { markedDirective } from './order-print.ts'
import { findingText, type TextContext } from './order-text.ts'
import { isCssProperty, standardName } from './property-relations.ts'

/**
 * Where a finding is reported: the later atom's name, or the rule's own node.
 */
function anchorOf(finding: Finding): PlanWarning['anchor'] {
  const { overrider } = finding.candidate
  if (overrider.kind === 'atom') {
    return { ref: overrider.directive.ref, offset: overrider.atom.offset }
  }
  return { ref: overrider.topRef, offset: undefined }
}

/**
 * The longhands of a finding that its directive's markers leave overridden.
 */
function remainingLonghands(finding: Finding, markers: readonly Marker[]): string[] {
  const covered = coveredLonghands(markers, finding.candidate.declaration.prop)
  if (covered.has('*')) return []
  return overriddenLonghands(finding.pairs).filter(
    (longhand) => !covered.has(standardName(longhand)),
  )
}

/**
 * The warning for one finding, or nothing when its directive's marker covers it.
 */
function warningOf(finding: Finding, all: readonly Finding[]): PlanWarning | undefined {
  const { prelude } = finding.unit.directive
  const remaining = remainingLonghands(finding, readMarkers(prelude).markers)
  if (remaining.length === 0) return undefined
  const names = namesForLonghands(remaining)
  const context: TextContext = {
    markerNames: names,
    markedDirective: markedDirective(prelude, names),
    moveAfter: lastOverriderIndex(finding, all),
  }
  return { anchor: anchorOf(finding), text: findingText(finding, context) }
}

/**
 * The findings of the order check as warnings, markers applied.
 */
export function findingWarnings(findings: readonly Finding[]): PlanWarning[] {
  return findings.flatMap((finding) => warningOf(finding, findings) ?? [])
}

/**
 * Whether a marker name covers something some finding of the directive overrides.
 */
function isUsed(name: string, findings: readonly Finding[]): boolean {
  if (name.toLowerCase() === 'all') {
    return findings.some((f) => f.candidate.declaration.prop.toLowerCase() === 'all')
  }
  const covered = new Set(longhandsCoveredBy(name))
  return findings.some((f) =>
    overriddenLonghands(f.pairs).some((longhand) => covered.has(standardName(longhand))),
  )
}

/**
 * The report for one marker name, if it is wrong. A name that covers nothing is reported only when
 * `isStaleReported`.
 */
function nameReport(
  name: string,
  findings: readonly Finding[],
  isStaleReported: boolean,
): string | undefined {
  if (!isCssProperty(name)) {
    return `@nave: the marker on this directive names "${name}", which is not a CSS property, so it allows nothing. The marker takes property names, such as display, not atom names.`
  }
  if (!isStaleReported || isUsed(name, findings)) return undefined
  return `@nave: the marker on this directive names ${name}, but nothing after the directive overrides ${name} in its atoms' blocks. Remove ${name} from the marker.`
}

/**
 * The reports for one directive's markers, in the order they are written.
 */
function markerReports(
  directive: DirectiveFacts,
  findings: readonly Finding[],
  options: MarkerOptions,
): PlanWarning[] {
  const { isStaleReported, outwardFor } = options
  const mine = [
    ...findings.filter((finding) => finding.unit.directive.ref === directive.ref),
    ...outwardFor(directive),
  ]
  const { markers, malformed } = readMarkers(directive.prelude)
  const reports: { readonly start: number; readonly text: string }[] = []
  for (const marker of markers) {
    if (marker.names.length === 0) {
      reports.push({
        start: marker.start,
        text: '@nave: the nave-allow-override marker on this directive names no property, so it allows nothing. Name the property a warning reported, or remove the marker.',
      })
    }
    for (const name of marker.names) {
      const text = nameReport(name, mine, isStaleReported)
      if (text) reports.push({ start: marker.start, text })
    }
  }
  for (const bad of malformed) {
    reports.push({
      start: bad.start,
      text: `@nave: the comment ${bad.text} in this directive is not a marker, so it allows nothing: a marker starts with nave-allow-override and a colon, with nothing between them, such as \`/* nave-allow-override: display */\`. Correct the comment, or remove it.`,
    })
  }
  return reports
    .toSorted((a, b) => a.start - b.start)
    .map(({ start, text }) => ({ anchor: { ref: directive.ref, offset: start }, text }))
}

/**
 * How the markers of a rule are judged: whether one that covers nothing is reported, and the
 * findings an enclosing rule found for a directive of this one, which its marker may cover.
 */
interface MarkerOptions {
  readonly isStaleReported: boolean
  readonly outwardFor: (directive: DirectiveFacts) => readonly Finding[]
}

/**
 * The reports about the markers of every directive of a rule.
 */
export function markerWarnings(
  directives: readonly DirectiveFacts[],
  findings: readonly Finding[],
  isStaleReported: boolean,
  outwardFor: MarkerOptions['outwardFor'],
): PlanWarning[] {
  const options = { isStaleReported, outwardFor }
  return directives.flatMap((directive) => markerReports(directive, findings, options))
}
