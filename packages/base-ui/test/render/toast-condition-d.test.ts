import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'

import { partsNamed } from '../support/dom.ts'
import { cleanup, user } from '../support/react.ts'
import { type Feedback, inAct, loadFeedback, type Props, settle } from '../support/w10-feedback.ts'
import { renderToasts, rootTitles } from '../support/w10-toast-scene.ts'

const feedback: Feedback = await loadFeedback()
afterEach(cleanup)

type Act = 'click' | 'enter' | 'space'
type Spy = Mock<() => void>

const ACTS: readonly Act[] = ['click', 'enter', 'space']
const KEYS = { enter: '{Enter}', space: ' ' } as const

interface Row {
  readonly marker: string
  readonly name: string
  /**
  Renders one toast with the part disabled or not, the spy on the row's signal, and returns what
  the row reads as the part's state.
   */
  readonly render: (isDisabled: boolean, spy: Spy) => Promise<void>
  readonly state: () => string
}

const ROWS: readonly Row[] = [
  {
    marker: 'Toast.Close',
    name: 'Toast.Close (the toast leaves the list)',
    render: async (isDisabled, spy) => {
      const scene = await renderToasts(feedback, { closeProps: { disabled: isDisabled } })
      // The signal is the toast's removal: the manager calls onClose when it closes the toast.
      await scene.add({ onClose: spy, onRemove: spy, title: 'Saved' })
    },
    state: () => rootTitles().join(','),
  },
  {
    marker: 'Toast.Action',
    name: 'Toast.Action (its onClick)',
    render: async (isDisabled, spy) => {
      const scene = await renderToasts(feedback, {
        actionProps: { disabled: isDisabled, onClick: spy } satisfies Props,
        withAction: true,
      })
      await scene.add({ title: 'Saved' })
    },
    state: () => rootTitles().join(','),
  },
]

/**
 * Delivers one act through user-event the way a person does: a pointer click, or focus on the part
 * and a key. A disabled native button takes no focus, so the key goes to the body.
 */
const deliver = async (marker: string, act: Act): Promise<void> => {
  const session = user()
  const target = partsNamed(marker)[0]!
  if (act === 'click') {
    await session.click(target)
  } else {
    await inAct(() => {
      target.focus()
    })
    await session.keyboard(KEYS[act])
  }
  await settle(150)
}

const attempt = async (
  row: Row,
  isDisabled: boolean,
  act: Act,
): Promise<{ after: string; before: string; called: boolean }> => {
  const spy: Spy = vi.fn<() => void>()
  await row.render(isDisabled, spy)
  const before = row.state()
  await deliver(row.marker, act)
  return { after: row.state(), before, called: spy.mock.calls.length > 0 }
}

describe('AC-base-ui-feedback-navigation-42: condition D for the toast buttons, each act proven able to activate', () => {
  for (const row of ROWS) {
    it(`${row.name}: every act that calls the signal on the enabled part calls nothing on the disabled part, and at least one act calls it on the enabled part`, async () => {
      const activating: Act[] = []
      for (const act of ACTS) {
        const { called } = await attempt(row, false, act)
        if (called) {
          activating.push(act)
        }
        await cleanup()
      }
      // The positive control: the click always activates the enabled part. A row whose enabled
      // part is never activated would pass vacuously.
      expect(activating).toContain('click')
      for (const act of activating) {
        const { after, before, called } = await attempt(row, true, act)
        expect({ act, called }).toEqual({ act, called: false })
        // Toast.Close: the toast stays in the DOM. Toast.Action: nothing else moved either.
        expect(after).toBe(before)
        await cleanup()
      }
    })

    it(`${row.name}: the disabled part carries a native disabled attribute and no aria-disabled`, async () => {
      await row.render(true, vi.fn<() => void>())
      const target = partsNamed(row.marker)[0]!
      expect(target.hasAttribute('disabled')).toBe(true)
      expect(target.getAttribute('aria-disabled')).toBeNull()
    })

    it(`${row.name}: control, the enabled part is not disabled and a click reaches it`, async () => {
      const spy: Spy = vi.fn<() => void>()
      await row.render(false, spy)
      const target = partsNamed(row.marker)[0]!
      expect(target.hasAttribute('disabled')).toBe(false)
      await deliver(row.marker, 'click')
      expect(spy.mock.calls.length).toBeGreaterThan(0)
    })
  }
})
