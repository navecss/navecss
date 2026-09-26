/**
 * `readDisabledStateNote` locates the docblock directly above `disabledState: {` by proximity
 * alone (the nearest `/** ... *\/` before the key line), so a decoy docblock inserted between the
 * real one and the key line — one that happens to also carry both sentence anchors — must not be
 * silently accepted. These tests plant a synthetic `atoms.ts` slice through the function's own
 * `sourceText` override rather than editing the real file.
 */
import { describe, expect, it } from 'vitest'

import { readDisabledStateNote } from '../scripts/disabled-state-note.ts'

const REAL_HEADER = 'disabledState — visual + behavioural disabled treatment.'

function docblock(lines: readonly string[]): string {
  return ['  /**', ...lines.map((line) => `   * ${line}`), '   */'].join('\n')
}

const REAL_DOCBLOCK = docblock([
  REAL_HEADER,
  'On the aria-disabled branch the element stays focusable, so the component keeps working',
  'through keyboard activation.',
])

const KEY_LINE = '  disabledState: {'

describe('readDisabledStateNote', () => {
  it('extracts the sentence from the real docblock immediately above the key line', () => {
    const source = [REAL_DOCBLOCK, KEY_LINE, '    declarations: {},', '  },'].join('\n')
    expect(readDisabledStateNote(source)).toBe(
      'On the aria-disabled branch the element stays focusable, so the component keeps working ' +
        'through keyboard activation.',
    )
  })

  it('throws rather than silently return a decoy docblock inserted between the real one and the key line', () => {
    // Carries both anchors ("On the aria-disabled branch" / "keyboard activation.") so the
    // pre-fix anchor-only check alone would accept it — it just does not open with disabledState's
    // own header line, which is the one thing that ties a docblock to this atom rather than to
    // mere proximity to the key line.
    const decoyDocblock = docblock([
      'interactive — an unrelated atom that happens to share both sentence anchors.',
      'On the aria-disabled branch this decoy also stays reachable by',
      'keyboard activation.',
    ])
    const source = [REAL_DOCBLOCK, decoyDocblock, KEY_LINE, '    declarations: {},', '  },'].join(
      '\n',
    )
    expect(() => readDisabledStateNote(source)).toThrow(/does not open with its own header line/)
  })
})
