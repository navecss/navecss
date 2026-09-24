/**
 * R29 (the customization ladder) + R33 (the 0.x upgrade posture per rung) + R30a (the
 * `tokens.presets` layer reservation, checked against `core`'s `index.css` in
 * `packages/core/test/`). Ordered by how much of Nave's generation is retained — the
 * only property that increases monotonically down the ladder.
 */

type UpgradePosture = 'fine' | 'unbounded-0x-bounded-1.0'

export interface LadderRung {
  rung: string
  situation: string
  whatYouWrite: string
  whereItLives: string
  cost: string
  preserves: string
  voids: string
  upgrade: UpgradePosture
  /**
   * Rung 0 is reserved with zero presets shipped at 0.1.0 — a scope decision
   * independent of whether the consumer build exists.
   */
  reserved?: true
}

export const LADDER: readonly LadderRung[] = [
  {
    rung: '0',
    situation: 'Just give me something that looks good.',
    whatYouWrite: 'nothing',
    whereItLives: 'a preset stylesheet import',
    cost: 'one import',
    preserves: 'everything, generated ahead of time from a seed Nave chose',
    voids: 'nothing',
    upgrade: 'fine',
    reserved: true,
  },
  {
    rung: '1a',
    situation: 'Warm our greys up.',
    whatYouWrite: 're-point the tint',
    whereItLives: 'a CSS block in your app',
    cost: 'one custom property',
    preserves: 'everything; the neutral surface re-hues live, the accent does not move',
    voids: 'nothing',
    upgrade: 'fine',
  },
  {
    rung: '1b',
    situation: 'Our brand colour is this.',
    whatYouWrite: 're-seed the accent',
    whereItLives: 'one build command, output committed',
    cost: 'one build command',
    preserves: 'everything, generated from your seed',
    voids: 'nothing',
    upgrade: 'fine',
  },
  {
    rung: '2',
    situation: 'Our danger red is the corporate red.',
    whatYouWrite: 'override a semantic slot',
    whereItLives: 'a CSS block in your app',
    cost: "generation, minus one role's link",
    preserves: 'the rest of the generated mapping',
    voids: 'the overridden slot, and anything that assumed the shipped value',
    upgrade: 'fine',
  },
  {
    rung: '3',
    situation: 'Step 500 is muddy in our brand.',
    whatYouWrite: 'override a step',
    whereItLives: 'a JSON file in your repo',
    cost: 'generation, minus one rung of one ramp',
    preserves: 'every other step',
    voids: 'contrast guarantees resting on the overridden step',
    upgrade: 'fine',
  },
  {
    rung: '4',
    situation: 'Our lightness ramp is different.',
    whatYouWrite: 'retheme through the build',
    whereItLives: 'your build config',
    cost: 'the semantic contract, not the ramp',
    preserves: 'the required core contract',
    voids: 'the shipped ramp shape',
    upgrade: 'unbounded-0x-bounded-1.0',
  },
  {
    rung: '5',
    situation: 'We have our own token source.',
    whatYouWrite: 'bring your own DTCG 2025.10',
    whereItLives: 'your repo',
    cost: 'nearly everything but the required core contract',
    preserves: 'the required core contract only',
    voids: 'every Nave-generated guarantee outside that contract',
    upgrade: 'unbounded-0x-bounded-1.0',
  },
]

/**
 *
 */
export function assertLadderOrder(): void {
  const order = LADDER.map((r) => r.rung)
  const expected = ['0', '1a', '1b', '2', '3', '4', '5']
  if (JSON.stringify(order) !== JSON.stringify(expected)) {
    throw new Error(
      `The theming-obligation ladder order is ${order.join(', ')}, expected ` +
        `${expected.join(', ')}. Open an issue.`,
    )
  }
}
