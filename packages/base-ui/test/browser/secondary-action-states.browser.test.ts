/**
 * The browser clauses of the secondary-action-states spec: the default Button variant and the
 * Toggle fill with `action.secondary.hover` under the pointer and `action.secondary.active` while
 * pressed, on all twelve parts the roster maps to `baseUiButton`, never on `primary` or `ghost`,
 * never when disabled, and the fill is all that moves. Read in a real engine with the built tokens
 * and stylesheet, through the built wrappers, in light and in dark.
 *
 * AC-05 (disabled), AC-11 (the Button matrix), AC-12 (all twelve parts), AC-13 (the Toggle) and
 * AC-21 (no fallback hides a stale tokens file). AC-22's browser clauses are the registry's.
 *
 * Every expected colour is read from a probe painted with the named custom property in the same
 * scheme. The pointer is the real one: a hover moves it over the part, a press holds the primary
 * button (or Space, for the part that does not hold `:active` for the pointer), and a row asserts
 * the state with `matches()` before it reads a colour.
 */
import type { ReactNode } from 'react'

import { beforeAll, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Button } from '../../dist/button/index.js'
import { Toggle } from '../../dist/toggle/index.js'
import { styledParts } from '../../scripts/wrappers/roster.ts'
import { requiredCopies } from '../support/registry/browser-injected.ts'
import { loadCopy } from '../support/registry/browser-load.ts'
import { isReachedWithin, MAX_FRAMES, nextFrame } from './support/frames.ts'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import {
  ariaDisabledProps,
  BUTTON_PARTS,
  mountPart,
  parkPointer,
  type PartCase,
  type Props,
  TOGGLE_PART,
} from './support/secondary-action-parts.ts'
import { colorOf, lengthOf, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w7-lists.ts'
import { dragTo, pressOn, releaseOn } from './support/w10-pointer.ts'

const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const

const COLOR_NAMES = [
  'action-highlight',
  'action-primary',
  'action-primary-active',
  'action-primary-hover',
  'action-secondary',
  'action-secondary-active',
  'action-secondary-hover',
  'border-control',
  'border-disabled',
  'content-disabled',
  'content-primary',
] as const

type ColorName = (typeof COLOR_NAMES)[number]
type Palette = Readonly<Record<ColorName, string>>

/**
What the engine computes for each colour the rows compare against, in the scheme in force.
 */
const readPalette = (): Palette =>
  Object.fromEntries(
    COLOR_NAMES.map((name) => [name, colorOf(`var(--nave-color-${name})`)]),
  ) as Palette

interface Paint {
  readonly background: string
  readonly border: readonly string[]
  readonly color: string
}

const sides = (color: string): string[] => SIDES.map(() => color)

const paintOf = (element: Element): Paint => {
  const style = getComputedStyle(element)
  return {
    background: style.backgroundColor,
    border: SIDES.map((side) => style[`border${side}Color`]),
    color: style.color,
  }
}

type SecondaryFill = 'action-secondary' | 'action-secondary-active' | 'action-secondary-hover'

/**
The paint of a default-variant part: a state fill, the primary text colour and the control border.
 */
const secondaryPaint = (palette: Palette, fill: SecondaryFill): Paint => ({
  background: palette[fill],
  border: sides(palette['border-control']),
  color: palette['content-primary'],
})

/**
The disabled paint: transparent, in the disabled colour, with the disabled border.
 */
const disabledPaint = (palette: Palette): Paint => ({
  background: TRANSPARENT,
  border: sides(palette['border-disabled']),
  color: palette['content-disabled'],
})

/**
What differs between two paints, one line to a field.
 */
const differences = (got: Paint, want: Paint): string[] =>
  (['background', 'border', 'color'] as const)
    .filter((field) => JSON.stringify(got[field]) !== JSON.stringify(want[field]))
    .map((field) => `${field} ${JSON.stringify(got[field])} is not ${JSON.stringify(want[field])}`)

type PointerState = 'active' | 'hover' | 'hover+active' | 'rest'

const POINTER_STATES: readonly PointerState[] = ['rest', 'hover', 'active', 'hover+active']

const FILL_UNDER: Readonly<Record<PointerState, SecondaryFill>> = {
  active: 'action-secondary-active',
  hover: 'action-secondary-hover',
  'hover+active': 'action-secondary-active',
  rest: 'action-secondary',
}

const MATCHES: Readonly<Record<PointerState, { active: boolean; hover: boolean }>> = {
  active: { active: true, hover: false },
  hover: { active: false, hover: true },
  'hover+active': { active: true, hover: true },
  rest: { active: false, hover: false },
}

const awayControl = (): HTMLElement => required('away')

/**
Brings the element into the state: the pointer rests away, moves over it, or presses it and, for
`active` alone, is dragged away with the button still down (`:active` stays on what was pressed).
 */
const enter = async (state: PointerState, element: HTMLElement): Promise<void> => {
  element.scrollIntoView({ block: 'center' })
  if (state === 'rest') {
    await parkPointer()
  } else if (state === 'hover') {
    await userEvent.hover(element)
  } else {
    await pressOn(element)
    if (state === 'active') {
      await dragTo(awayControl())
    }
  }
}

/**
Lets go of what `enter` held, away from the element so that no click reaches it, and rests the pointer.
 */
const leave = async (state: PointerState): Promise<void> => {
  if (state === 'active' || state === 'hover+active') {
    await releaseOn(awayControl())
  }
  await parkPointer()
}

interface Observation<Value> {
  /**
  Whether the element matched exactly the pseudo-classes the state names.
   */
  readonly took: boolean
  readonly value: Value
}

const observeUnder = async <Value>(
  state: PointerState,
  element: HTMLElement,
  observe: (element: HTMLElement) => Value,
): Promise<Observation<Value>> => {
  await enter(state, element)
  const want = MATCHES[state]
  const observation = {
    took: element.matches(':hover') === want.hover && element.matches(':active') === want.active,
    value: observe(element),
  }
  await leave(state)
  return observation
}

const readUnder = (state: PointerState, element: HTMLElement): Promise<Observation<Paint>> =>
  observeUnder(state, element, paintOf)

interface Surface {
  readonly palette: Palette
  /**
  Mounts the part, replacing what was mounted, and returns the element under test.
   */
  readonly mount: (part: PartCase, props?: Props) => Promise<HTMLElement>
  /**
  Mounts a scene of the test's own, replacing what was mounted.
   */
  readonly show: (scene: ReactNode) => Promise<void>
}

interface SurfaceOptions {
  readonly scheme: Scheme
  /**
  The sheets in the document, in order: the built tokens and the built stylesheet unless given.
   */
  readonly sheets?: readonly string[]
}

/**
Puts the sheets and the scheme in the document, runs the test body on them and puts everything back.
 */
const withSurface = async <Result>(
  { scheme, sheets = [tokens, stylesheet] }: SurfaceOptions,
  run: (surface: Surface) => Promise<Result>,
): Promise<Result> => {
  const removeSheets = useSheets(...sheets)
  const removeScheme = useScheme(scheme)
  let current: Page | undefined
  const clear = (): void => {
    current?.dispose()
    current = undefined
  }
  try {
    return await run({
      mount: async (part, props = {}) => {
        clear()
        const mounted = await mountPart(part, props)
        current = mounted.page
        return mounted.subject
      },
      palette: readPalette(),
      show: async (scene) => {
        clear()
        current = mount(scene)
        await nextFrame()
        await parkPointer()
      },
    })
  } finally {
    clear()
    removeScheme()
    removeSheets()
  }
}

type PressMeans = 'keyboard' | 'pointer'

/**
The pointer is tried first; a part that does not hold `:active` for it (a menu trigger opens on the
press) is tried again, freshly mounted, with Space held on the focused part.
 */
const PRESS_MEANS: readonly PressMeans[] = ['pointer', 'keyboard']

interface Held {
  readonly means: PressMeans
  /**
  Lets go, with the pointer released at the target (the part itself, to click it).
   */
  readonly release: (target: Element) => Promise<void>
  readonly subject: HTMLElement
}

const press = async (means: PressMeans, subject: HTMLElement): Promise<Held['release']> => {
  if (means === 'pointer') {
    subject.scrollIntoView({ block: 'center' })
    await pressOn(subject)
    return (target) => releaseOn(target)
  }
  subject.focus()
  await userEvent.keyboard('{Space>}')
  return async () => {
    await userEvent.keyboard('{/Space}')
  }
}

/**
Presses a freshly mounted part and holds it, or says nothing if no means made it `:active`.
 */
const holdFresh = async (
  surface: Surface,
  part: PartCase,
  props: Props,
): Promise<Held | undefined> => {
  for (const means of PRESS_MEANS) {
    const subject = await surface.mount(part, props)
    const release = await press(means, subject)
    if (subject.matches(':active')) {
      return { means, release, subject }
    }
    await release(awayControl())
    await parkPointer()
  }
  return undefined
}

/**
The paint while the part is pressed, or nothing if no means pressed it.
 */
const readPressed = async (
  surface: Surface,
  part: PartCase,
  props: Props,
): Promise<Paint | undefined> => {
  const held = await holdFresh(surface, part, props)
  if (held === undefined) {
    return undefined
  }
  const paint = paintOf(held.subject)
  await held.release(awayControl())
  await parkPointer()
  return paint
}

/**
A Toggle that is pressed on, as the wrapper renders it from its first frame.
 */
const PRESSED_TOGGLE: PartCase = {
  ...TOGGLE_PART,
  name: 'Toggle (pressed)',
  render: (props) => TOGGLE_PART.render({ defaultPressed: true, ...props }),
}

const TWELVE_PARTS = [
  'Button',
  'Toolbar.Button',
  'Dialog.Trigger',
  'Dialog.Close',
  'AlertDialog.Trigger',
  'AlertDialog.Close',
  'Popover.Trigger',
  'Popover.Close',
  'Menu.Trigger',
  'Tooltip.Trigger',
  'Toast.Action',
  'Toast.Close',
]

const DISABLING = [
  { how: 'natively disabled', isNative: true },
  { how: 'disabled through aria-disabled="true"', isNative: false },
] as const

// ---------------------------------------------------------------------------------------------
// AC-05

describe.each(SCHEMES)(
  'AC-secondary-action-states-05: a disabled part takes no state fill, in %s',
  (scheme) => {
    describe.each([...BUTTON_PARTS, TOGGLE_PART, PRESSED_TOGGLE])('$name', (part) => {
      const id = part === PRESSED_TOGGLE ? '13' : '05'
      it.each(DISABLING)(
        `AC-secondary-action-states-${id}: $how, hover and press leave the disabled paint`,
        async ({ isNative }) => {
          const props = isNative ? part.nativeProps : ariaDisabledProps()
          await withSurface({ scheme }, async (surface) => {
            const disabled = disabledPaint(surface.palette)
            const subject = await surface.mount(part, props)
            expect(
              subject.matches(isNative ? ':disabled' : '[aria-disabled="true"]'),
              'disabled the way the case says',
            ).toBe(true)
            const rest = await readUnder('rest', subject)
            expect(rest.value, 'at rest').toEqual(disabled)
            const hover = await readUnder('hover', subject)
            expect(hover.took, 'the pointer is over it').toBe(true)
            expect(
              hover.value,
              'under hover, equal to the same part with the pointer away',
            ).toEqual(rest.value)

            // A part that takes no `:active` while disabled has no press to read.
            const pressed = await readPressed(surface, part, props)
            expect(pressed ?? disabled, 'while pressed, where the part takes :active').toEqual(
              disabled,
            )

            // The positive control: the enabled twin fills on the same hover.
            const twin = await surface.mount(part)
            const twinHover = await readUnder('hover', twin)
            expect(twinHover.took, 'the pointer is over the enabled twin').toBe(true)
            expect(twinHover.value.background, 'the enabled twin on hover').toBe(
              surface.palette['action-secondary-hover'],
            )
          })
        },
      )
    })
  },
)

// ---------------------------------------------------------------------------------------------
// AC-11

interface Choice {
  readonly name: string
  readonly props: Props
}

const VARIANTS: readonly Choice[] = [
  { name: 'no variant', props: {} },
  { name: 'variant secondary', props: { variant: 'secondary' } },
  { name: 'hand-written data-nave-variant secondary', props: { 'data-nave-variant': 'secondary' } },
  { name: 'primary', props: { variant: 'primary' } },
  { name: 'ghost', props: { variant: 'ghost' } },
]

const EXPANDED: readonly Choice[] = [
  { name: 'aria-expanded absent', props: {} },
  { name: 'aria-expanded true', props: { 'aria-expanded': true } },
  { name: 'aria-expanded false', props: { 'aria-expanded': false } },
]

const DISABLEDNESS: readonly Choice[] = [
  { name: 'enabled', props: {} },
  { name: 'disabled', props: { disabled: true } },
  { name: 'aria-disabled', props: { 'aria-disabled': true } },
]

interface Cell {
  readonly id: string
  readonly isDefaultForm: boolean
  readonly isEnabled: boolean
  readonly props: Props
  readonly variant: 'ghost' | 'primary' | 'secondary'
}

const variantOf = (choice: Choice): Cell['variant'] =>
  choice.name === 'primary' || choice.name === 'ghost' ? choice.name : 'secondary'

const CELLS: readonly Cell[] = VARIANTS.flatMap((variant) =>
  EXPANDED.flatMap((expanded) =>
    DISABLEDNESS.map((disabledness): Cell => ({
      id: [variant.name, expanded.name, disabledness.name].join(' | '),
      isDefaultForm: variantOf(variant) === 'secondary',
      isEnabled: disabledness.name === 'enabled',
      props: { ...variant.props, ...expanded.props, ...disabledness.props },
      variant: variantOf(variant),
    })),
  ),
)

const grid = (): ReactNode =>
  h(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', gap: 12, padding: 48 } },
    ...CELLS.map((cell) =>
      h(Button, { key: cell.id, 'data-testid': cell.id, ...cell.props }, 'Save'),
    ),
    h('div', {
      'data-testid': 'away',
      style: { height: 40, left: 0, position: 'fixed', top: 0, width: 40 },
    }),
  )

const keyOf = (cell: Cell, state: PointerState): string => `${cell.id} @ ${state}`

interface Matrix {
  readonly palette: Palette
  readonly readings: ReadonlyMap<string, Observation<Paint>>
}

const measureMatrix = (scheme: Scheme, sheet: string): Promise<Matrix> =>
  withSurface({ scheme, sheets: [tokens, sheet] }, async (surface) => {
    await surface.show(grid())
    const readings = new Map<string, Observation<Paint>>()
    for (const cell of CELLS) {
      for (const state of POINTER_STATES) {
        readings.set(keyOf(cell, state), await readUnder(state, required(cell.id)))
      }
    }
    return { palette: surface.palette, readings }
  })

const SECONDARY_STATE_RULE =
  /\n[ \t]*\} [^\n{}]*\{ background-color: var\(--nave-color-action-secondary-(?:active|hover)\);/g

/**
The stylesheet without the rules that set `action.secondary`'s state fills (the Button's two keys
and the Toggle's two), and how many rules that took out.
 */
const withoutSecondaryStateRules = (sheet: string): { removed: number; sheet: string } => {
  let removed = 0
  const stripped = sheet.replaceAll(SECONDARY_STATE_RULE, () => {
    removed += 1
    return ''
  })
  return { removed, sheet: stripped }
}

const STRIPPED = withoutSecondaryStateRules(stylesheet)

const cellsWhere = (isWanted: (cell: Cell) => boolean): Cell[] =>
  CELLS.filter((cell) => isWanted(cell))

const sorted = (items: readonly string[]): string[] =>
  items.toSorted((first, second) => first.localeCompare(second))

const reading = (matrix: Matrix, cell: Cell, state: PointerState): Observation<Paint> =>
  matrix.readings.get(keyOf(cell, state))!

/**
The paint a disabled cell computes: the disabled paint, and for the ghost variant (whose own rule
follows the disabled one in the sheet) the transparent border it has when it is not disabled.
 */
const disabledCellPaint = (palette: Palette, cell: Cell): Paint => ({
  ...disabledPaint(palette),
  ...(cell.variant === 'ghost' && { border: sides(TRANSPARENT) }),
})

/**
Every pointer state of an enabled cell is required to take; of a disabled one, the pointer resting and moving over it.
 */
const isRequiredToTake = (cell: Cell, state: PointerState): boolean =>
  cell.isEnabled || state === 'hover' || state === 'rest'

const EXPLICIT_FILL: Readonly<
  Record<'ghost' | 'primary', Readonly<Record<'active' | 'hover', keyof Palette>>>
> = {
  ghost: { active: 'action-highlight', hover: 'action-highlight' },
  primary: { active: 'action-primary-active', hover: 'action-primary-hover' },
}

describe('AC-secondary-action-states-11: the stylesheet the matrix strips', () => {
  it('AC-secondary-action-states-11: the four state rules are in the built stylesheet', () => {
    expect(STRIPPED.removed).toBe(4)
  })
})

describe.each(SCHEMES)(
  'AC-secondary-action-states-11: no state combination reaches primary or ghost, and the default variant takes its states, in %s',
  (scheme) => {
    let full: Matrix
    let stripped: Matrix

    beforeAll(async () => {
      full = await measureMatrix(scheme, stylesheet)
      stripped = await measureMatrix(scheme, STRIPPED.sheet)
    }, 600_000)

    it('AC-secondary-action-states-11: default forms take rest, hover and active fills', () => {
      const wrong = cellsWhere((cell) => cell.isDefaultForm && cell.isEnabled).flatMap((cell) =>
        POINTER_STATES.flatMap((state) =>
          differences(
            reading(full, cell, state).value,
            secondaryPaint(full.palette, FILL_UNDER[state]),
          ).map((difference) => `${keyOf(cell, state)}: ${difference}`),
        ),
      )
      expect(wrong).toEqual([])
    })

    it('AC-secondary-action-states-11: every pointer state took', () => {
      const notTaken = [full, stripped].flatMap((matrix, pass) =>
        CELLS.flatMap((cell) =>
          POINTER_STATES.filter(
            (state) => isRequiredToTake(cell, state) && !reading(matrix, cell, state).took,
          ).map((state) => `${pass === 0 ? 'built' : 'stripped'}: ${keyOf(cell, state)}`),
        ),
      )
      expect(notTaken).toEqual([])
    })

    it('AC-secondary-action-states-11: primary and ghost cells equal the stylesheet without the four keys', () => {
      const wrong = cellsWhere((cell) => !cell.isDefaultForm).flatMap((cell) =>
        POINTER_STATES.flatMap((state) => {
          const got = reading(full, cell, state).value
          const lines = differences(got, reading(stripped, cell, state).value).map(
            (difference) => `${keyOf(cell, state)} against the stripped sheet: ${difference}`,
          )
          if (state !== 'rest' && cell.isEnabled) {
            const fill =
              EXPLICIT_FILL[cell.variant as 'ghost' | 'primary'][
                state === 'hover' ? 'hover' : 'active'
              ]
            if (got.background !== full.palette[fill]) {
              lines.push(`${keyOf(cell, state)} fills ${got.background}, not ${fill}`)
            }
          }
          return lines
        }),
      )
      expect(wrong).toEqual([])
    })

    it('AC-secondary-action-states-11: disabled cells compute the disabled paint', () => {
      const wrong = cellsWhere((cell) => !cell.isEnabled).flatMap((cell) =>
        POINTER_STATES.flatMap((state) =>
          differences(reading(full, cell, state).value, disabledCellPaint(full.palette, cell)).map(
            (difference) => `${keyOf(cell, state)}: ${difference}`,
          ),
        ),
      )
      expect(wrong).toEqual([])
    })

    it('AC-secondary-action-states-11: the keys change exactly the enabled hover and active default cells', () => {
      const differing = CELLS.flatMap((cell) =>
        POINTER_STATES.filter(
          (state) =>
            differences(reading(full, cell, state).value, reading(stripped, cell, state).value)
              .length > 0,
        ).map((state) => keyOf(cell, state)),
      )
      const expected = cellsWhere((cell) => cell.isDefaultForm && cell.isEnabled).flatMap((cell) =>
        POINTER_STATES.filter((state) => state !== 'rest').map((state) => keyOf(cell, state)),
      )
      expect(sorted(differing)).toEqual(sorted(expected))
    })
  },
)

// ---------------------------------------------------------------------------------------------
// AC-12

const FILL_BY_VARIANT: Readonly<
  Record<'ghost' | 'primary', readonly (keyof Palette | 'transparent')[]>
> = {
  ghost: ['transparent', 'action-highlight', 'action-highlight'],
  primary: ['action-primary', 'action-primary-hover', 'action-primary-active'],
}

const isOpen = (subject: HTMLElement): boolean => subject.getAttribute('aria-expanded') === 'true'

const notMeasuredForPress: string[] = []

describe('AC-secondary-action-states-12: the roster maps exactly the twelve parts to baseUiButton', () => {
  it('AC-secondary-action-states-12: roster, spec and scenes name the same twelve', () => {
    const mapped = Object.entries(styledParts)
      .filter(([, part]) => part.atoms.includes('baseUiButton'))
      .map(([name]) => name)
    expect(sorted(mapped)).toEqual(sorted(TWELVE_PARTS))
    expect(sorted(BUTTON_PARTS.map((part) => part.name))).toEqual(sorted(TWELVE_PARTS))
  })
})

describe.each(SCHEMES)(
  'AC-secondary-action-states-12: all twelve parts take the fills, in %s',
  (scheme) => {
    describe.each(BUTTON_PARTS)('$name', (part) => {
      it('AC-secondary-action-states-12: default variant: rest, hover and press fills', async () => {
        await withSurface({ scheme }, async (surface) => {
          const subject = await surface.mount(part)
          const rest = await readUnder('rest', subject)
          const hover = await readUnder('hover', subject)
          const pressed = await readPressed(surface, part, {})
          if (pressed === undefined) {
            notMeasuredForPress.push(`${part.name} in ${scheme}`)
          }
          expect([rest.took, hover.took], 'rest and hover took').toEqual([true, true])
          expect(rest.value).toEqual(secondaryPaint(surface.palette, 'action-secondary'))
          expect(hover.value).toEqual(secondaryPaint(surface.palette, 'action-secondary-hover'))
          expect(pressed).toEqual(secondaryPaint(surface.palette, 'action-secondary-active'))
        })
      })

      it('AC-secondary-action-states-12: primary and ghost variants: what AC-11 gives', async () => {
        await withSurface({ scheme }, async (surface) => {
          const observed: Record<string, (string | undefined)[]> = {}
          const expected: Record<string, string[]> = {}
          for (const variant of ['primary', 'ghost'] as const) {
            const props = { variant }
            const subject = await surface.mount(part, props)
            const rest = await readUnder('rest', subject)
            const hover = await readUnder('hover', subject)
            const pressed = await readPressed(surface, part, props)
            if (pressed === undefined) {
              notMeasuredForPress.push(`${part.name} (${variant}) in ${scheme}`)
            }
            observed[variant] = [rest.value.background, hover.value.background, pressed?.background]
            expected[variant] = FILL_BY_VARIANT[variant].map((fill) =>
              fill === 'transparent' ? TRANSPARENT : surface.palette[fill],
            )
          }
          expect(observed).toEqual(expected)
        })
      })

      if (part.isPopupOpener) {
        it('AC-secondary-action-states-12: a popup-opening press: active while held, rest fill once open', async () => {
          await withSurface({ scheme }, async (surface) => {
            const held = await holdFresh(surface, part, {})
            expect(held, 'the press took :active').toBeDefined()
            const { release, subject } = held!
            const whileHeld = paintOf(subject)
            await release(held!.means === 'pointer' ? subject : awayControl())
            const hasOpened = await isReachedWithin(() => isOpen(subject), MAX_FRAMES)
            await parkPointer()
            await nextFrame()
            expect(hasOpened, 'the popup opened').toBe(true)
            expect(subject.matches(':hover'), 'the pointer is away').toBe(false)
            expect(subject.matches(':active'), 'it is not pressed').toBe(false)
            expect(whileHeld).toEqual(secondaryPaint(surface.palette, 'action-secondary-active'))
            expect(paintOf(subject), 'open, no open-state fill').toEqual(
              secondaryPaint(surface.palette, 'action-secondary'),
            )
          })
        })
      }
    })
  },
)

describe('AC-secondary-action-states-12: every part was pressed', () => {
  it('AC-secondary-action-states-12: no part is left unmeasured for press', () => {
    expect(notMeasuredForPress).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// AC-13

interface AfterBox {
  readonly color: string
  readonly content: string
  readonly insets: readonly string[]
  readonly style: string
  readonly width: string
}

const afterOf = (element: Element): AfterBox => {
  const style = getComputedStyle(element, '::after')
  return {
    color: style.borderBlockEndColor,
    content: style.content,
    insets: [style.insetInlineStart, style.insetInlineEnd, style.insetBlockEnd],
    style: style.borderBlockEndStyle,
    width: style.borderBlockEndWidth,
  }
}

/**
What an element with no `::after` box computes for its `content`.
 */
const NO_BOX = /^(?:none|normal)$/u

describe.each(SCHEMES)(
  'AC-secondary-action-states-13: the Toggle takes the same fills pressed or not, in %s',
  (scheme) => {
    it.each([false, true])(
      'AC-secondary-action-states-13: pressed=%s: four fills, same underline, same colours',
      async (isPressed) => {
        await withSurface({ scheme }, async (surface) => {
          const subject = await surface.mount(TOGGLE_PART)
          if (isPressed) {
            await userEvent.click(subject)
            await parkPointer()
          }
          expect(subject.getAttribute('aria-pressed'), 'the toggle is pressed or not').toBe(
            String(isPressed),
          )
          const observations = []
          for (const state of POINTER_STATES) {
            observations.push(
              await observeUnder(state, subject, (element) => ({
                after: afterOf(element),
                paint: paintOf(element),
              })),
            )
          }
          const { palette } = surface
          expect(
            observations.map(({ took }) => took),
            'each pointer state took',
          ).toEqual([true, true, true, true])
          expect(observations.map(({ value }) => value.paint.background)).toEqual(
            POINTER_STATES.map((state) => palette[FILL_UNDER[state]]),
          )
          expect(
            observations.map(({ value }) => [value.paint.color, value.paint.border]),
            'the text and border colours',
          ).toEqual(
            POINTER_STATES.map(() => [
              palette['content-primary'],
              sides(palette['border-control']),
            ]),
          )
          const afters = observations.map(({ value }) => value.after)
          expect(afters, '::after is the same in all four states').toEqual(
            POINTER_STATES.map(() => afters[0]),
          )
          expect(NO_BOX.test(afters[0]!.content), 'no ::after box unless pressed').toBe(!isPressed)
          expect(afters[0], 'the underline of a pressed toggle').toMatchObject(
            isPressed
              ? {
                  color: palette['content-primary'],
                  style: 'solid',
                  width: `${String(lengthOf('var(--nave-border-width-lg)'))}px`,
                }
              : {},
          )
        })
      },
    )
  },
)

// ---------------------------------------------------------------------------------------------
// AC-21

const TOKENS_STATE_SLOT = /^[ \t]*--nave-color-action-secondary-(?:active|hover):[^\n;]*;\n?/gm

/**
The built tokens without the declarations of `action.secondary`'s two state slots: the file a
consumer committed before the slots existed.
 */
const withoutStateSlots = (css: string): string => css.replaceAll(TOKENS_STATE_SLOT, '')

const STALE_TOKENS = withoutStateSlots(tokens)

describe('AC-secondary-action-states-21: the tokens file the slots are removed from', () => {
  it('AC-secondary-action-states-21: built tokens declare the two slots, the stale copy neither', () => {
    expect(tokens).toContain('--nave-color-action-secondary-hover:')
    expect(tokens).toContain('--nave-color-action-secondary-active:')
    expect(STALE_TOKENS).not.toContain('--nave-color-action-secondary-hover')
    expect(STALE_TOKENS).not.toContain('--nave-color-action-secondary-active')
  })
})

describe.each(SCHEMES)(
  'AC-secondary-action-states-21: no fallback hides a stale tokens file, in %s',
  (scheme) => {
    describe.each([BUTTON_PARTS[0]!, TOGGLE_PART])('$name', (part) => {
      it.each([
        { sheets: [STALE_TOKENS, stylesheet], tokensAre: 'without the two names', isStale: true },
        { sheets: [tokens, stylesheet], tokensAre: 'unmodified (the control)', isStale: false },
      ])(
        'AC-secondary-action-states-21: over tokens $tokensAre: hover and press fills',
        async ({ isStale, sheets }) => {
          await withSurface({ scheme, sheets }, async (surface) => {
            const subject = await surface.mount(part)
            const rest = await readUnder('rest', subject)
            const hover = await readUnder('hover', subject)
            const pressed = await readUnder('hover+active', subject)
            const { palette } = surface
            expect([hover.took, pressed.took], 'hover and press took').toEqual([true, true])
            expect(rest.value).toEqual(secondaryPaint(palette, 'action-secondary'))
            const want = (fill: SecondaryFill): Paint => ({
              ...secondaryPaint(palette, 'action-secondary'),
              background: isStale ? TRANSPARENT : palette[fill],
            })
            expect(hover.value, 'under hover').toEqual(want('action-secondary-hover'))
            expect(pressed.value, 'while pressed').toEqual(want('action-secondary-active'))
          })
        },
      )
    })
  },
)

// ---------------------------------------------------------------------------------------------
// AC-22 [A3]

const COPIED = [
  { packaged: Button, subpath: 'button' },
  { packaged: Toggle, subpath: 'toggle' },
] as const

const SECONDARY_STATE_RULE_IN_COPY =
  /[^{}]*\{\s*background-color:\s*var\(--nave-color-action-secondary-(?:hover|active)\);\s*\}/g

const copyScene = (ui: unknown): ReactNode =>
  h(
    'div',
    { style: { padding: 48 } },
    h(ui, { 'data-testid': 'subject' }, 'Save'),
    h('div', {
      'data-testid': 'away',
      style: { height: 40, left: 0, position: 'fixed', top: 0, width: 40 },
    }),
  )

const fills = (observations: Observation<string>[]): string[] =>
  observations.map(({ value }) => value)

const took = (observations: Observation<string>[]): boolean[] =>
  observations.map(({ took: hasTaken }) => hasTaken)

const stateFillsOf = async (surface: Surface, ui: unknown): Promise<Observation<string>[]> => {
  await surface.show(copyScene(ui))
  const subject = required('subject')
  return [
    await observeUnder('hover', subject, (element) => getComputedStyle(element).backgroundColor),
    await observeUnder(
      'hover+active',
      subject,
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]
}

describe.each(SCHEMES)(
  'AC-secondary-action-states-22: the registry copies of the Button and the Toggle take the package fills under hover and while pressed, in %s',
  (scheme) => {
    it.each(COPIED)('AC-secondary-action-states-22: $subpath', async ({ packaged, subpath }) => {
      const folder = requiredCopies().paint.find((entry) => entry.subpath === subpath)?.copyFolder
      expect(folder, `the registry has a copy of ${subpath}`).toBeDefined()
      const copy = await loadCopy(folder!, subpath)
      let removed = 0
      const stripped = copy.css.replaceAll(SECONDARY_STATE_RULE_IN_COPY, () => {
        removed += 1
        return ''
      })
      expect(removed, 'the copy carries the two state rules').toBe(2)

      await withSurface({ scheme, sheets: [tokens, stylesheet, copy.css] }, async (surface) => {
        const ofPackage = await stateFillsOf(surface, packaged)
        const ofCopy = await stateFillsOf(surface, copy.ui)
        expect([...took(ofPackage), ...took(ofCopy)], 'each state took').toEqual([
          true,
          true,
          true,
          true,
        ])
        expect(fills(ofPackage)).toEqual([
          surface.palette['action-secondary-hover'],
          surface.palette['action-secondary-active'],
        ])
        expect(fills(ofCopy), 'the copy equals the package').toEqual(fills(ofPackage))
      })

      // The control: the copy without its two state rules does not fill.
      await withSurface({ scheme, sheets: [tokens, stylesheet, stripped] }, async (surface) => {
        const ofPackage = await stateFillsOf(surface, packaged)
        const ofCopy = await stateFillsOf(surface, copy.ui)
        expect(fills(ofCopy), 'a copy without the state rules').not.toEqual(fills(ofPackage))
      })
    })
  },
)
