import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { cleanup, render, user } from '../support/react.ts'
import { recordCarried, recordRelated, unrecordedPairs } from '../support/row-pairs.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { topName } from '../support/subpaths.ts'
import { COMBOBOX_PAIRS, pair } from '../support/vocabulary-pairs.ts'
import {
  chipsTree,
  insidePopupTree,
  type Kind,
  KINDS,
  standardTree,
} from '../support/w6-combobox.ts'
import {
  arrowThrough,
  contextMenuTree,
  highlighted,
  menubarTree,
  menuTree,
  openByClick,
  openContextMenu,
  selectTree,
} from '../support/w6-menus.ts'
import { el, found, need, settle } from '../support/w6-render.ts'

const nave: Source = await loadNave()
const bare: Source = await loadBare()
afterEach(cleanup)

const C = 'nave-base-ui-'

const inputOf = (kind: Kind): HTMLElement => need(`${topName(kind)}.Input`)

/**
Clicks the input and, where the click did not open the list (the Autocomplete's does not), opens
it with ArrowDown.
 */
const openList = async (kind: Kind): Promise<void> => {
  await user().click(inputOf(kind))
  await settle()
  if (found(`${topName(kind)}.Popup`) === undefined) {
    await user().keyboard('{ArrowDown}')
    await settle()
  }
}

/**
Presses ArrowDown until an option is highlighted (at most `limit` times).
 */
const arrowUntilHighlighted = async (limit = 4): Promise<HTMLElement> => {
  for (let press = 0; press < limit; press += 1) {
    await user().keyboard('{ArrowDown}')
    await settle(10)
    const [option] = highlighted()
    if (option !== undefined) {
      return option
    }
  }
  throw new Error(`no option was highlighted after ${limit} presses of ArrowDown`)
}

/**
What the criterion reads off an active option: where focus is, what the input names, and what the
option carries.
 */
const activeOptionOf = (kind: Kind, option: HTMLElement): Record<string, unknown> => {
  const input = inputOf(kind)
  const summary = {
    activeElementIsInput: document.activeElement === input,
    classes: [`${C}item`, `${C}active-option`, `${C}item-highlight`].filter((name) =>
      option.classList.contains(name),
    ),
    describedByActivedescendant:
      option.id !== '' && input.getAttribute('aria-activedescendant') === option.id,
    isHighlighted: option.dataset.highlighted !== null,
    role: option.getAttribute('role'),
  }
  recordCarried(option, 'data-highlighted')
  return summary
}

const ACTIVE_OPTION = {
  activeElementIsInput: true,
  classes: [`${C}item`, `${C}active-option`, `${C}item-highlight`],
  describedByActivedescendant: true,
  isHighlighted: true,
  role: 'option',
}

describe('AC-base-ui-overlay-completion-11: the active option is marked while focus stays in the input', () => {
  for (const kind of KINDS) {
    it(`${kind}: ArrowDown highlights an option, the input keeps focus and names it by aria-activedescendant`, async () => {
      await render(standardTree(nave, kind))
      await openList(kind)
      const option = await arrowUntilHighlighted()
      expect(activeOptionOf(kind, option)).toEqual(ACTIVE_OPTION)
    })

    it(`${kind}: hovering an option highlights it, with the input still focused`, async () => {
      await render(standardTree(nave, kind))
      await openList(kind)
      const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      const target = options[1]
      expect(target, 'the second option is rendered').toBeDefined()
      await user().hover(target!)
      await settle(10)
      expect(highlighted()).toEqual([target])
      expect(activeOptionOf(kind, target!)).toEqual(ACTIVE_OPTION)
    })
  }

  const OTHER_LISTS = [
    {
      name: 'Menu',
      open: async () => {
        await render(menuTree(nave, bare))
        await openByClick('Menu.Trigger')
      },
    },
    {
      name: 'Context Menu',
      open: async () => {
        await render(contextMenuTree(nave, bare))
        await openContextMenu()
      },
    },
    {
      name: 'Menubar menu',
      open: async () => {
        await render(menubarTree(nave, bare))
        await openByClick('Menu.Trigger')
      },
    },
    {
      name: 'Select',
      open: async () => {
        await render(selectTree(nave))
        await openByClick('Select.Trigger')
      },
    },
  ] as const

  for (const { name, open } of OTHER_LISTS) {
    it(`${name}: no part carries ${C}active-option, with items highlighted`, async () => {
      await open()
      const seen = await arrowThrough(3)
      expect(seen).not.toEqual([])
      expect([...document.querySelectorAll(`.${C}active-option`)]).toEqual([])
    })
  }

  it('control: a Combobox open with an option highlighted does carry the class on it', async () => {
    await render(standardTree(nave, 'combobox'))
    await openList('combobox')
    await arrowUntilHighlighted()
    expect(document.querySelectorAll(`.${C}active-option`).length).toBeGreaterThan(0)
  })
})

/**
 * One act of the disabled-option row: arrow to an option and press Enter, or click it. Each act
 * renders afresh, with a spy on the Root's `onValueChange`.
 */
type Act = 'arrow and Enter' | 'click'

const OPTIONS = { apple: 0, banana: 1 } as const

interface Outcome {
  readonly calls: unknown[]
  readonly option: HTMLElement
  readonly valueBefore: string
  readonly valueAfter: string
  readonly highlightedBeforeCommit: HTMLElement | undefined
}

const act = async (kind: Kind, target: keyof typeof OPTIONS, how: Act): Promise<Outcome> => {
  const calls: unknown[] = []
  await render(
    standardTree(nave, kind, {
      disabled: ['banana'],
      root: {
        onValueChange: (value: unknown) => {
          calls.push(value)
        },
      },
    }),
  )
  await openList(kind)
  const input = inputOf(kind)
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  const option = options[OPTIONS[target]]!
  const valueBefore = input.getAttribute('value') ?? (input as HTMLInputElement).value
  let highlightedBeforeCommit: HTMLElement | undefined
  if (how === 'arrow and Enter') {
    // The Autocomplete's first ArrowDown opened the list above only if the click did not; walk
    // until the target is the highlighted option.
    for (let press = 0; press < 5 && highlighted()[0] !== option; press += 1) {
      await user().keyboard('{ArrowDown}')
      await settle(10)
    }
    highlightedBeforeCommit = highlighted()[0]
    await user().keyboard('{Enter}')
  } else {
    await user().click(option)
  }
  await settle()
  return {
    calls,
    highlightedBeforeCommit,
    option,
    valueAfter: (input as HTMLInputElement).value,
    valueBefore,
  }
}

describe('AC-base-ui-overlay-completion-12: a highlighted disabled option commits nothing', () => {
  for (const kind of KINDS) {
    it(`${kind}: banana is highlighted and disabled, and Enter on it calls nothing and leaves the input's value`, async () => {
      const outcome = await act(kind, 'banana', 'arrow and Enter')
      expect(outcome.highlightedBeforeCommit).toBe(outcome.option)
      expect(Object.hasOwn(outcome.option.dataset, 'highlighted')).toBe(true)
      expect(outcome.option.getAttribute('aria-disabled')).toBe('true')
      expect(Object.hasOwn(outcome.option.dataset, 'disabled')).toBe(true)
      expect(outcome.calls).toEqual([])
      expect(outcome.valueAfter).toBe(outcome.valueBefore)
    })

    it(`${kind}: clicking banana calls nothing and leaves the input's value`, async () => {
      const outcome = await act(kind, 'banana', 'click')
      expect(Object.hasOwn(outcome.option.dataset, 'highlighted')).toBe(true)
      expect(outcome.option.getAttribute('aria-disabled')).toBe('true')
      expect(Object.hasOwn(outcome.option.dataset, 'disabled')).toBe(true)
      expect(outcome.calls).toEqual([])
      expect(outcome.valueAfter).toBe(outcome.valueBefore)
    })

    it(`${kind}: control, the same two acts on apple each call onValueChange once with "apple"`, async () => {
      const byKey = await act(kind, 'apple', 'arrow and Enter')
      expect(byKey.highlightedBeforeCommit).toBe(byKey.option)
      expect(byKey.calls).toEqual(['apple'])
      await cleanup()
      const byClick = await act(kind, 'apple', 'click')
      expect(byClick.calls).toEqual(['apple'])
    })
  }

  it('control: the Autocomplete needs one more ArrowDown than the Combobox to reach the same option', async () => {
    const presses: Record<Kind, number> = { autocomplete: 0, combobox: 0 }
    for (const kind of KINDS) {
      await render(standardTree(nave, kind, { disabled: ['banana'] }))
      await user().click(inputOf(kind))
      await settle()
      while (highlighted()[0]?.textContent !== 'banana' && presses[kind] < 6) {
        await user().keyboard('{ArrowDown}')
        await settle(10)
        presses[kind] += 1
      }
      await cleanup()
    }
    expect(presses.combobox).toBe(2)
    expect(presses.autocomplete).toBe(3)
  })
})

const asDiv = { nativeButton: false, render: createElement('div') }

describe('AC-base-ui-overlay-completion-24: the Combobox trigger reads its layout from ARIA Base UI must set', () => {
  for (const kind of KINDS) {
    it(`${kind}: in the standard layout the Trigger is aria-haspopup="listbox" and tabindex="-1", the Clear tabindex="-1"`, async () => {
      await render(standardTree(nave, kind, { root: { defaultValue: 'apple' } }))
      const trigger = need(`${topName(kind)}.Trigger`)
      const clear = need(`${topName(kind)}.Clear`)
      expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
      expect(trigger.getAttribute('tabindex')).toBe('-1')
      expect(trigger.classList.contains(`${C}combobox-trigger`)).toBe(true)
      expect(clear.getAttribute('tabindex')).toBe('-1')
      expect(clear.classList.contains(`${C}number-field-stepper`)).toBe(true)
    })
  }

  it('combobox: in the input-inside-popup layout the Trigger is aria-haspopup="dialog" and tabindex="0"', async () => {
    await render(insidePopupTree(nave))
    const trigger = need('Combobox.Trigger')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('tabindex')).toBe('0')
    expect(trigger.classList.contains(`${C}combobox-trigger`)).toBe(true)
    recordCarried(trigger, 'aria-haspopup', 'dialog')
  })

  it('combobox: in the input-inside-popup layout the Trigger carries aria-invalid="true" inside an invalid Field', async () => {
    await render(el(nave, 'field', 'Root', { invalid: true }, insidePopupTree(nave)))
    const trigger = need('Combobox.Trigger')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.classList.contains(`${C}combobox-trigger`)).toBe(true)
    recordCarried(trigger, 'aria-invalid', 'true')
  })

  for (const [name, tree] of [
    [
      'standard layout',
      () => standardTree(nave, 'combobox', { root: { disabled: true }, parts: { Trigger: asDiv } }),
    ],
    [
      'input-inside-popup layout',
      () => insidePopupTree(nave, { root: { disabled: true }, parts: { Trigger: asDiv } }),
    ],
  ] as const) {
    it(`combobox: the ${name} Trigger carries aria-disabled when it is not a native button and the Root is disabled`, async () => {
      await render(tree())
      const trigger = need('Combobox.Trigger')
      expect(trigger.tagName).toBe('DIV')
      expect(trigger.getAttribute('aria-disabled')).toBe('true')
      expect(trigger.hasAttribute('disabled')).toBe(false)
      recordCarried(trigger, 'aria-disabled', 'true')
    })
  }

  it('control: the two layouts differ in both attributes, so a check that read only one layout would not tell them apart', async () => {
    await render(standardTree(nave, 'combobox'))
    const standard = need('Combobox.Trigger')
    const read = [standard.getAttribute('aria-haspopup'), standard.getAttribute('tabindex')]
    await render(insidePopupTree(nave))
    const inside = need('Combobox.Trigger')
    expect([inside.getAttribute('aria-haspopup'), inside.getAttribute('tabindex')]).not.toEqual(
      read,
    )
  })
})

const chipsOf = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-part="Combobox.Chip"]'),
]

const removeSpy = (): { calls: unknown[]; root: Record<string, unknown> } => {
  const calls: unknown[] = []
  return {
    calls,
    root: {
      onValueChange: (value: unknown) => {
        calls.push(value)
      },
    },
  }
}

describe('AC-base-ui-overlay-completion-25: chips take focus, and a disabled chip does nothing', () => {
  it('enabled: clicking the input and pressing ArrowLeft focuses the last Chip', async () => {
    await render(chipsTree(nave))
    await user().click(need('Combobox.Input'))
    await settle()
    await user().keyboard('{ArrowLeft}')
    await settle(10)
    const chips = chipsOf()
    expect(chips).toHaveLength(2)
    expect(document.activeElement).toBe(chips.at(-1))
  })

  for (const key of ['Backspace', 'Delete']) {
    it(`enabled: ${key} on the last focused Chip calls onValueChange once with ["apple"]`, async () => {
      const spy = removeSpy()
      await render(chipsTree(nave, { root: spy.root }))
      chipsOf().at(-1)!.focus()
      await user().keyboard(`{${key}}`)
      await settle()
      expect(spy.calls).toEqual([['apple']])
    })

    it(`Root disabled: ${key} on a focused Chip calls nothing, two Chips remain, and the Chip is aria-disabled and data-disabled`, async () => {
      const spy = removeSpy()
      await render(chipsTree(nave, { root: { ...spy.root, disabled: true } }))
      const chip = chipsOf().at(-1)!
      chip.focus()
      await user().keyboard(`{${key}}`)
      await settle()
      expect(spy.calls).toEqual([])
      expect(chipsOf()).toHaveLength(2)
      expect(chip.getAttribute('aria-disabled')).toBe('true')
      expect(Object.hasOwn(chip.dataset, 'disabled')).toBe(true)
      expect(chip.classList.contains(`${C}chip`)).toBe(true)
      recordCarried(chip, 'aria-disabled', 'true')
    })
  }

  it('enabled: clicking a ChipRemove calls onValueChange once', async () => {
    const spy = removeSpy()
    await render(chipsTree(nave, { root: spy.root }))
    await user().click(need('Combobox.ChipRemove'))
    await settle()
    expect(spy.calls).toEqual([['cherry']])
  })

  it('Root disabled: clicking a ChipRemove calls nothing, and it is aria-disabled and data-disabled without native disabled', async () => {
    const spy = removeSpy()
    await render(chipsTree(nave, { root: { ...spy.root, disabled: true } }))
    const remove = need('Combobox.ChipRemove')
    await user().click(remove)
    await settle()
    expect(spy.calls).toEqual([])
    expect(chipsOf()).toHaveLength(2)
    expect(remove.getAttribute('aria-disabled')).toBe('true')
    expect(Object.hasOwn(remove.dataset, 'disabled')).toBe(true)
    expect(remove.hasAttribute('disabled')).toBe(false)
    expect(remove.classList.contains(`${C}chip-remove`)).toBe(true)
    recordCarried(remove, 'aria-disabled', 'true')
  })
})

describe('AC-base-ui-overlay-completion-26: the empty message is always present, and says so only when the list is empty', () => {
  for (const kind of KINDS) {
    it(`${kind}: Empty is a live status child of the Popup in both states, and data-empty marks the Popup and List only when nothing matches`, async () => {
      await render(standardTree(nave, kind))
      const input = inputOf(kind)
      await user().click(input)
      await user().type(input, 'app')
      await settle()
      const states: Record<string, boolean> = {}
      const read = (name: string): void => {
        const popup = need(`${topName(kind)}.Popup`)
        const empty = need(`${topName(kind)}.Empty`)
        expect(empty.parentElement).toBe(popup)
        expect(empty.getAttribute('role')).toBe('status')
        expect(empty.getAttribute('aria-live')).toBe('polite')
        expect(empty.classList.contains(`${C}list-empty`)).toBe(true)
        const list = need(`${topName(kind)}.List`)
        if (name === 'none') {
          recordRelated(empty, popup, 'data-empty')
        }
        states[`${name} popup`] = Object.hasOwn(popup.dataset, 'empty')
        states[`${name} list`] = Object.hasOwn(list.dataset, 'empty')
      }
      read('match')
      await user().clear(input)
      await user().type(input, 'zzz')
      await settle()
      read('none')
      expect(states).toEqual({
        'match list': false,
        'match popup': false,
        'none list': true,
        'none popup': true,
      })
    })
  }
})

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the Combobox and Autocomplete rows cover every pair they own', () => {
  it('has recorded every pair of the combobox table', () => {
    expect(unrecordedPairs(COMBOBOX_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('chip', 'data-planted')] })).toEqual([
      'nave-base-ui-chip data-planted',
    ])
  })
})
