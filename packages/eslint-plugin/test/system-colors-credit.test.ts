/**
 * AC-eslint-plugin-27 covers: R5b (the credit beside the system colour list).
 */
import { describe, expect, it } from 'vitest'

import { packTarball } from './helpers/pack.ts'

const SYSTEM_COLOR_CREDIT =
  'The ignoreValues patterns in this file contain the current <system-color> keywords, the names alone, copied from the System Colors section (https://www.w3.org/TR/css-color-4/#css-system-colors) of CSS Color Module Level 4 (W3C). Copyright (c) 2026 World Wide Web Consortium. That specification is published under the W3C Software and Document License (https://www.w3.org/copyright/software-license-2023/).'

const SYSTEM_COLOR_KEYWORDS = [
  'AccentColor',
  'AccentColorText',
  'ActiveText',
  'ButtonBorder',
  'ButtonFace',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'Mark',
  'MarkText',
  'SelectedItem',
  'SelectedItemText',
  'VisitedText',
]

describe('AC-eslint-plugin-27 covers: R5b (credit)', () => {
  const tarball = packTarball()
  const packed = JSON.parse(
    tarball.read('package/dist/generated/style-properties.recorded.json'),
  ) as { $credit?: unknown; ignoreValues: Record<string, string> }

  it('the packed copy carries the CSS Color Module Level 4 credit, byte-exact', () => {
    expect(packed.$credit).toBe(SYSTEM_COLOR_CREDIT)
  })

  it('the packed patterns carry the system colour keywords the credit describes', () => {
    const patterns = Object.values(packed.ignoreValues)
    for (const keyword of SYSTEM_COLOR_KEYWORDS) {
      const bounded = new RegExp(`[|(]${keyword}[|)]`)
      expect(patterns.some((pattern) => bounded.test(pattern))).toBe(true)
    }
  })
})
