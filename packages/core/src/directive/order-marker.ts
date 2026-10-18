/**
 * The opt-out marker: a comment inside a directive's prelude, written
 * `/* nave-allow-override: <property> [<property> ...] [-- <reason>] *\/`, naming the properties
 * the directive's atoms may have overridden. Only the prelude is read, because it is the one place
 * a comment survives every host. A comment that starts `nave-allow-override` and is not a marker is
 * reported, so a typo does not silently allow nothing.
 */
import { longhandsOf } from './property-relations.ts'
import { tokenize } from './tokenizer.ts'

const MARKER_HEAD = 'nave-allow-override'

export interface Marker {
  /**
  Where the comment starts and ends in the prelude.
   */
  readonly end: number
  readonly names: readonly string[]
  /**
  The reason after `--`, as written, when there is one.
   */
  readonly reason: string | undefined
  readonly start: number
}

interface MalformedMarker {
  readonly end: number
  readonly start: number
  readonly text: string
}

export interface PreludeMarkers {
  readonly malformed: readonly MalformedMarker[]
  readonly markers: readonly Marker[]
}

/**
 * A marker from the body of a comment that starts `nave-allow-override:`.
 */
function parseMarker(body: string, start: number, end: number): Marker {
  const rest = body.slice(MARKER_HEAD.length + 1)
  const separator = rest.search(/(?:^|\s)--(?:\s|$)/)
  const namesText = separator === -1 ? rest : rest.slice(0, separator)
  const reason =
    separator === -1
      ? undefined
      : rest
          .slice(separator)
          .replace(/^\s*--/, '')
          .trim()
  return { start, end, names: namesText.split(/\s+/).filter(Boolean), reason }
}

/**
 * Every marker in `prelude`, and every comment that starts like one and is not one.
 */
export function readMarkers(prelude: string): PreludeMarkers {
  const markers: Marker[] = []
  const malformed: MalformedMarker[] = []
  for (const token of tokenize(prelude)) {
    if (token.type !== 'comment' || token.raw.length < 4 || !token.raw.endsWith('*/')) continue
    const body = token.raw.slice(2, -2).trim()
    if (!body.startsWith(MARKER_HEAD)) continue
    if (body.startsWith(`${MARKER_HEAD}:`)) {
      markers.push(parseMarker(body, token.startIndex, token.endIndex))
    } else {
      malformed.push({ start: token.startIndex, end: token.endIndex, text: token.raw })
    }
  }
  return { markers, malformed }
}

/**
 * The longhands a marker name covers. A longhand covers itself, a shorthand its longhands, a
 * custom or vendor-prefixed property itself; `all` covers nothing here, since it covers only an
 * overrider that itself sets `all`.
 */
export function longhandsCoveredBy(name: string): readonly string[] {
  return name.toLowerCase() === 'all' ? [] : longhandsOf(name)
}

/**
 * The longhands that every marker of a directive covers for an overrider setting `laterProperty`.
 */
export function coveredLonghands(markers: readonly Marker[], laterProperty: string): Set<string> {
  const covered = new Set<string>()
  const isAll = laterProperty.toLowerCase() === 'all'
  for (const marker of markers) {
    for (const name of marker.names) {
      if (isAll && name.toLowerCase() === 'all') covered.add('*')
      for (const longhand of longhandsCoveredBy(name)) covered.add(longhand)
    }
  }
  return covered
}
