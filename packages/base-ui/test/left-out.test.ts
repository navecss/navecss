import { describe, expect, it } from 'vitest'

import { isLeftOutConstants } from './support/left-out.ts'

describe("isLeftOutConstants is the namespace of one of this subpath's parts, and nothing wider", () => {
  it.each([
    ['Dialog', 'DialogPopupDataAttributes', true],
    ['Tabs', 'TabsIndicatorCssVariables', true],
    ['Dialog', 'TabsIndicatorDataAttributes', false],
    ['Dialog', 'DialogPopupDataAttributesExtra', false],
    ['Dialog', 'DialogHandle', false],
    ['Dialog', 'Dialog', false],
  ])('%s %s is %s', (top, name, expected) => {
    expect(isLeftOutConstants(top, name)).toBe(expected)
  })
})
