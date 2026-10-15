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
  settle,
  until,
} from '../support/w10-feedback.ts'
import {
  feedbackFor,
  minorsOfRun,
  type Redirect,
  redirectOf,
} from '../support/w10-minors-feedback.ts'
import { renderNavigationMenu, triggerOf } from '../support/w10-navigation-scene.ts'
import { additionsOf, recordMutations } from '../support/w10-recorder.ts'

const own: Feedback = await loadFeedback()

describe('AC-base-ui-feedback-navigation-20: what a disabled trigger does at each minor (the second scenario, the minor runs)', () => {
  /**
  The Examples table: whether a disabled trigger carries data-disabled, and what its aria-expanded
  reads after a hover and after a click.
   */
  const EXAMPLES = [
    { isDataDisabled: false, minors: ['1.3.0', '1.4.0', '1.5.0'], opens: 'true' },
    { isDataDisabled: false, minors: ['1.6.0', '1.7.0'], opens: 'false' },
    { isDataDisabled: true, minors: ['1.8.0'], opens: 'false' },
  ] as const

  interface Observed {
    readonly ariaDisabled: string | undefined
    readonly expanded: string | undefined
    readonly isDataDisabled: boolean
    readonly isPopupOpen: boolean
  }

  type Facts = Record<'click' | 'hover', Record<'disabled' | 'enabled', Observed>>

  /**
  A fresh render with an enabled item and an item whose trigger is disabled; one trigger takes one act.
   */
  const observe = async (
    feedback: Feedback,
    act: 'click' | 'hover',
    kind: 'disabled' | 'enabled',
  ): Promise<Observed> => {
    await renderNavigationMenu(feedback, { disabledTrigger: true })
    const target = triggerOf(kind)
    const session = user()
    await (act === 'hover' ? session.hover(target) : session.click(target))
    await settle(300)
    const observed = {
      ariaDisabled: target.getAttribute('aria-disabled') ?? undefined,
      expanded: target.getAttribute('aria-expanded') ?? undefined,
      isDataDisabled: target.dataset.disabled !== undefined,
      isPopupOpen: target.dataset.popupOpen !== undefined,
    }
    await cleanup()
    return observed
  }

  for (const minor of minorsOfRun()) {
    describe(`at Base UI ${minor.version}`, () => {
      let facts: Facts | undefined
      let redirect: Redirect | undefined
      const example = EXAMPLES.find(({ minors }) =>
        (minors as readonly string[]).includes(minor.version),
      )

      beforeAll(async () => {
        const feedback = await feedbackFor(own, minor)
        redirect = await redirectOf(feedback, minor, {
          namespace: 'NavigationMenu',
          part: 'Portal',
        })
        facts = {
          click: {
            disabled: await observe(feedback, 'click', 'disabled'),
            enabled: await observe(feedback, 'click', 'enabled'),
          },
          hover: {
            disabled: await observe(feedback, 'hover', 'disabled'),
            enabled: await observe(feedback, 'hover', 'enabled'),
          },
        }
      })
      afterAll(cleanup)

      it('the minor is a row of the Examples table, installed, and the wrapped Portal is that minor Base UI own (the redirect took)', () => {
        expect(example).toBeDefined()
        expect(redirect).toEqual({
          isDifferentFromAnotherMinor: true,
          isInstalled: true,
          isThisMinor: true,
        })
      })

      for (const act of ['hover', 'click'] as const) {
        it(`the enabled trigger opens on ${act} (aria-expanded true, data-popup-open), the positive control`, () => {
          expect(facts![act].enabled).toEqual({
            ariaDisabled: 'false',
            expanded: 'true',
            isDataDisabled: false,
            isPopupOpen: true,
          })
        })

        it(`the disabled trigger carries aria-disabled true and the table's data-disabled, and on ${act} its aria-expanded is the table's`, () => {
          expect(facts![act].disabled).toMatchObject({
            ariaDisabled: 'true',
            expanded: example!.opens,
            isDataDisabled: example!.isDataDisabled,
          })
        })
      }
    })
  }
})

const classesOf = (marker: string): string[] =>
  partsNamed(marker).flatMap((element) => naveClasses(element))

/**
The part marker of an element, or its tag when it carries none.
 */
const markerOf = (element: Element): string =>
  (element instanceof HTMLElement ? element.dataset.part : undefined) ?? element.tagName

describe('AC-base-ui-feedback-navigation-23: the panel fade-in keys what Base UI sets (the minor runs)', () => {
  interface Facts {
    readonly contentClasses: string[]
    readonly endingTargets: string[]
    readonly insertedPopupAttributes: readonly string[] | undefined
    readonly popupClasses: string[]
    readonly popupTag: string
    readonly viewportClasses: string[]
  }

  const openThenEscape = async (feedback: Feedback): Promise<Facts> => {
    addStyleSheet('[data-part="NavigationMenu.Popup"] { transition-duration: 50ms; }')
    await renderNavigationMenu(feedback)
    const recorder = recordMutations()
    await user().click(triggerOf())
    await until('the popup to open', () => partsNamed('NavigationMenu.Popup').length === 1)
    await settle()
    const popup = partsNamed('NavigationMenu.Popup')[0]!
    const opened = {
      contentClasses: classesOf('NavigationMenu.Content'),
      popupClasses: naveClasses(popup),
      popupTag: popup.tagName,
      viewportClasses: classesOf('NavigationMenu.Viewport'),
    }
    await user().keyboard('{Escape}')
    await until('the popup to close', () => partsNamed('NavigationMenu.Popup').length === 0)
    recorder.stop()
    const inserted = recorder.records.find(
      (record) => record.kind === 'inserted' && record.insertedParts.has('NavigationMenu.Popup'),
    )
    const facts: Facts = {
      ...opened,
      endingTargets: additionsOf(recorder, 'data-ending-style').map((record) =>
        markerOf(record.target),
      ),
      insertedPopupAttributes: inserted?.insertedParts.get('NavigationMenu.Popup'),
    }
    await cleanup()
    removeStyleSheets()
    return facts
  }

  for (const minor of minorsOfRun()) {
    describe(`at Base UI ${minor.version}`, () => {
      let facts: Facts | undefined

      beforeAll(async () => {
        facts = await openThenEscape(await feedbackFor(own, minor))
      })
      afterAll(async () => {
        await cleanup()
        removeStyleSheets()
      })

      it('NavigationMenu.Popup renders a nav and carries nave-base-ui-popover-popup and nave-base-ui-navigation-menu-fade', () => {
        expect(facts!.popupTag).toBe('NAV')
        expect(facts!.popupClasses).toEqual([`${BASE}navigation-menu-fade`, `${BASE}popover-popup`])
      })

      it('the Popup is inserted carrying data-starting-style (and data-open, the control that the insertion snapshot reads attributes)', () => {
        expect(facts!.insertedPopupAttributes).toBeDefined()
        expect(facts!.insertedPopupAttributes).toContain('data-open')
        expect(facts!.insertedPopupAttributes).toContain('data-starting-style')
      })

      it('on Escape data-ending-style is added to the Popup', () => {
        expect(facts!.endingTargets).toContain('NavigationMenu.Popup')
      })

      it('NavigationMenu.Content and NavigationMenu.Viewport carry no nave- class (no content fade)', () => {
        expect(facts!.contentClasses).toEqual([])
        expect(facts!.viewportClasses).toEqual([])
      })
    })
  }
})

describe('AC-base-ui-feedback-navigation-39: every new attribute the stylesheet keys on appears where its rule reaches (Navigation Menu, open then Escape)', () => {
  it('data-starting-style at insertion and data-ending-style on NavigationMenu.Popup, nave-base-ui-navigation-menu-fade on the carrier', async () => {
    try {
      addStyleSheet('[data-part="NavigationMenu.Popup"] { transition-duration: 50ms; }')
      await renderNavigationMenu(own)
      const recorder = recordMutations()
      await user().click(triggerOf())
      await until('the popup to open', () => partsNamed('NavigationMenu.Popup').length === 1)
      const popup = partsNamed('NavigationMenu.Popup')[0]!
      await settle()
      await user().keyboard('{Escape}')
      await until('the popup to close', () => partsNamed('NavigationMenu.Popup').length === 0)
      recorder.stop()
      const inserted = recorder.records.find(
        (record) => record.kind === 'inserted' && record.insertedParts.has('NavigationMenu.Popup'),
      )
      expect(inserted?.insertedParts.get('NavigationMenu.Popup')).toContain('data-starting-style')
      expect(additionsOf(recorder, 'data-ending-style').map((record) => record.target)).toContain(
        popup,
      )
      expect(popup.classList.contains(`${BASE}navigation-menu-fade`)).toBe(true)
    } finally {
      removeStyleSheets()
    }
  })
})
