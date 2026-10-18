/**
 * AC-native-apply-order-44 (the core's half): `reportStaleMarkers: false` turns off the report of a
 * marker that covers nothing and no other report about a marker.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../src/directive/expand-text.ts'

const STALE = '.s { @nave /* nave-allow-override: display */ flex; }'
const EMPTY = '.m { @nave /* nave-allow-override: */ flex; }'
const NOT_PROPERTY = '.n { @nave /* nave-allow-override: nope-prop */ flex; }'
const MALFORMED = '.o { @nave /* nave-allow-override display */ flex; }'

describe('AC-native-apply-order-44: the stale report switch of expandText()', () => {
  it('reports a marker that covers nothing by default and with the switch on', () => {
    expect(expandText(STALE).warnings).toHaveLength(1)
    expect(expandText(STALE, { reportStaleMarkers: true }).warnings).toHaveLength(1)
  })

  it('reports it with the switch off: nothing', () => {
    expect(expandText(STALE, { reportStaleMarkers: false }).warnings).toEqual([])
  })

  it.each([EMPTY, NOT_PROPERTY, MALFORMED])('still reports %s with the switch off', (css) => {
    expect(expandText(css, { reportStaleMarkers: false }).warnings).toHaveLength(1)
  })

  it('still reports an overriding pair with the switch off', () => {
    const css = '.c { @nave hideDesktopUp flex; }'

    expect(expandText(css, { reportStaleMarkers: false }).warnings).toHaveLength(1)
  })
})
