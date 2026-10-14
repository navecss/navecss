import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { partsNamed } from '../support/dom.ts'
import { cleanup, user } from '../support/react.ts'
import {
  addStyleSheet,
  BASE,
  type Feedback,
  loadFeedback,
  naveClasses,
  removeStyleSheets,
  until,
} from '../support/w10-feedback.ts'
import {
  feedbackFor,
  minorsOfRun,
  type Redirect,
  redirectOf,
} from '../support/w10-minors-feedback.ts'
import { additionsOf, recordMutations } from '../support/w10-recorder.ts'
import { renderToasts, rootTitles } from '../support/w10-toast-scene.ts'

const own: Feedback = await loadFeedback()

interface Facts {
  /**
  For each data-ending-style added: whether focus is inside the root it lands on, and whether it
  is inside the other toast.
   */
  readonly endings: { isInsideClosing: boolean; isInsideOther: boolean; root: string }[]
  readonly isBeforeEnterOnNewestClose: boolean
  readonly isClosingRemoved: boolean
  readonly isOtherEnding: boolean
  readonly remainingTitles: string[]
  readonly rootClasses: string[][]
}

/**
 * Two toasts that stay (timeout 0) under a test sheet that gives Toast.Root a literal
 * transition-duration; a MutationObserver records the attribute additions; F6 is pressed, Tab moves
 * focus until it reaches the newest toast's Toast.Close, and Enter is pressed there.
 */
const closeFromKeyboard = async (feedback: Feedback): Promise<Facts> => {
  addStyleSheet('[data-part="Toast.Root"] { transition-duration: 50ms; }')
  const scene = await renderToasts(feedback)
  await scene.add({ title: 'older' })
  await scene.add({ title: 'newer' })
  const [newest, older] = partsNamed('Toast.Root') as [HTMLElement, HTMLElement]
  const rootClasses = partsNamed('Toast.Root').map((root) => naveClasses(root))
  const newestClose = partsNamed('Toast.Close')[0]!
  const session = user()
  await session.keyboard('{F6}')
  for (let tabs = 0; tabs < 5 && document.activeElement !== newestClose; tabs += 1) {
    await session.tab()
  }
  const isBeforeEnterOnNewestClose = document.activeElement === newestClose
  const recorder = recordMutations()
  await session.keyboard('{Enter}')
  await until('the closing toast to leave', () => !document.contains(newest))
  recorder.stop()
  const endings = additionsOf(recorder, 'data-ending-style')
  const facts: Facts = {
    endings: endings.map((record) => ({
      isInsideClosing: record.isActiveInsideTarget,
      isInsideOther: older.contains(record.activeElement),
      root: record.target === newest ? 'newer' : 'other',
    })),
    isBeforeEnterOnNewestClose,
    isClosingRemoved: !document.contains(newest),
    isOtherEnding: older.dataset.endingStyle !== undefined,
    remainingTitles: rootTitles(),
    rootClasses,
  }
  await cleanup()
  removeStyleSheets()
  return facts
}

describe('AC-base-ui-feedback-navigation-14: the toast fade keys what Base UI sets, and keyboard focus leaves a closing toast first (the minor runs)', () => {
  for (const minor of minorsOfRun()) {
    describe(`at Base UI ${minor.version}`, () => {
      let facts: Facts | undefined
      let redirect: Redirect | undefined

      beforeAll(async () => {
        const feedback = await feedbackFor(own, minor)
        redirect = await redirectOf(feedback, minor, { namespace: 'Toast', part: 'Provider' })
        facts = await closeFromKeyboard(feedback)
      })
      afterAll(async () => {
        await cleanup()
        removeStyleSheets()
      })

      it('the minor is installed, and the wrapped Toast.Provider is that minor Base UI own part (the redirect took)', () => {
        expect(redirect).toEqual({
          isDifferentFromAnotherMinor: true,
          isInstalled: true,
          isThisMinor: true,
        })
      })

      it('before Enter, document.activeElement is the newest toast Toast.Close (the act starts inside the toast)', () => {
        expect(facts!.isBeforeEnterOnNewestClose).toBe(true)
      })

      it('when data-ending-style is added to the closing root, document.activeElement is not inside that root', () => {
        // Exactly one root ends: the closing one. The focus is read when the record is.
        expect(facts!.endings.map(({ root }) => root)).toEqual(['newer'])
        expect(facts!.endings.map(({ isInsideClosing }) => isInsideClosing)).toEqual([false])
      })

      it('the focus is on the other toast when data-ending-style lands (it has moved off the closing one, not dropped)', () => {
        expect(facts!.endings.map(({ isInsideOther }) => isInsideOther)).toEqual([true])
      })

      it('the closing root is removed from the DOM after its transition, and the remaining toast is still open', () => {
        expect(facts!.isClosingRemoved).toBe(true)
        expect(facts!.remainingTitles).toEqual(['older'])
        expect(facts!.isOtherEnding).toBe(false)
      })

      it('every root carries nave-base-ui-toast-root and nave-base-ui-toast-fade', () => {
        expect(facts!.rootClasses).toHaveLength(2)
        for (const classes of facts!.rootClasses) {
          expect(classes).toContain(`${BASE}toast-root`)
          expect(classes).toContain(`${BASE}toast-fade`)
        }
      })
    })
  }
})
