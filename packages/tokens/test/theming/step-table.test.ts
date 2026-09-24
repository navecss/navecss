import { describe, expect, it } from 'vitest'

import { STEP_TABLE, stepLightness } from '../../src/theming/step-table.ts'

describe('AC-theming-02 covers: R2', () => {
  it('has exactly the 15 rows the shared step table defines, with the 850 row at L 0.225', () => {
    const steps = STEP_TABLE.map((r) => r.step)
    expect(steps).toEqual([0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950, 1000])
    expect(stepLightness(850)).toBe(0.225)
  })

  it('every step number maps to exactly one fixed lightness, identical across lookups', () => {
    for (const { step, l } of STEP_TABLE) {
      expect(stepLightness(step)).toBe(l)
    }
  })

  it('fails naming the step when a scale asks for a step the table does not define', () => {
    expect(() => stepLightness(650)).toThrow(/650/)
  })
})
