/**
 * AC-base-ui-bridge-55, the Tier B clause: in a real engine a disabled Accordion or Collapsible
 * trigger computes the disabled colour and a `not-allowed` cursor, and an enabled one the primary
 * colour and a `pointer`, at the floor and at the current Base UI. From 1.9.0 a trigger rendered as
 * its default native button is disabled by the `disabled` attribute and carries no `aria-disabled`,
 * so the rule has to key `:disabled` as well; rendered as a `div` it carries `aria-disabled` at
 * every minor.
 *
 * The control is the stylesheet as it was, the trigger keyed on `[aria-disabled="true"]` alone: a
 * native trigger on 1.9.0 then keeps the enabled colour and cursor, and the floor is unchanged.
 *
 * One case changes at every Base UI version, the floor included: an enabled native trigger inside a
 * `<fieldset disabled>`. The browser disables that button though Base UI does not mark it, so it
 * matches `:disabled` and takes the disabled paint; the control keeps the enabled paint there.
 */
import { afterEach, describe, expect, inject, it } from 'vitest'

import { Accordion } from '../../dist/accordion/index.js'
import { Collapsible } from '../../dist/collapsible/index.js'
import { framesLater } from './support/frames.ts'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { colorOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w11-page.ts'

const FLOOR = '1.3.0'
const isFloor = inject('baseUi') === FLOOR

const TRIGGER_RULE = '  .nave-base-ui-disclosure-trigger '
const NATIVE_BRANCH = '&:disabled, &[aria-disabled="true"]{'

/**
A sheet with the trigger keyed on `[aria-disabled="true"]` alone, as it was.
 */
const withoutNativeBranch = (sheet: string): string => {
  const lines = sheet.split('\n')
  const at = lines.findIndex((line) => line.startsWith(TRIGGER_RULE))
  expect(at, 'the trigger rule is in the built stylesheet').toBeGreaterThan(-1)
  lines[at] = (lines[at] ?? '').replace(NATIVE_BRANCH, '&[aria-disabled="true"]{')
  const previous = lines.join('\n')
  expect(previous, 'the stylesheet has the key to take out').not.toBe(sheet)
  return previous
}

const previousStylesheet = (): string => withoutNativeBranch(stylesheet)

interface Case {
  readonly form: 'div' | 'native'
  readonly id: string
  readonly isDisabled: boolean
  readonly part: 'accordion' | 'collapsible'
}

const CASES: readonly Case[] = (['accordion', 'collapsible'] as const).flatMap((part) =>
  (['native', 'div'] as const).flatMap((form) =>
    [true, false].map((isDisabled) => ({
      form,
      id: `${part}-${form}-${isDisabled ? 'disabled' : 'enabled'}`,
      isDisabled,
      part,
    })),
  ),
)

const trigger = ({ form, id, isDisabled, part }: Case): ReturnType<typeof h> => {
  const props =
    form === 'div'
      ? { 'data-testid': id, nativeButton: false, render: h('div') }
      : { 'data-testid': id }
  const header = h(Accordion.Header, {}, h(Accordion.Trigger, props, 'Title'))
  return part === 'accordion'
    ? h(
        Accordion.Root,
        {},
        h(
          Accordion.Item,
          { disabled: isDisabled, value: id },
          header,
          h(Accordion.Panel, {}, 'Panel'),
        ),
      )
    : h(
        Collapsible.Root,
        { disabled: isDisabled },
        h(Collapsible.Trigger, props, 'Title'),
        h(Collapsible.Panel, {}, 'Panel'),
      )
}

const DISABLED_CASES = CASES.filter((one) => one.isDisabled)

const DISABLED = { cursor: 'not-allowed', token: 'var(--nave-color-content-disabled)' }
const ENABLED = { cursor: 'pointer', token: 'var(--nave-color-content-primary)' }

const paint = (one: Case): { readonly color: string; readonly cursor: string } => {
  const style = getComputedStyle(required(one.id))
  return { color: style.color, cursor: style.cursor }
}

const scene = (): ReturnType<typeof h> =>
  h('div', { style: { padding: 24 } }, ...CASES.map((one) => trigger(one)))

const FIELDSET_CASES: readonly Case[] = (['accordion', 'collapsible'] as const).map((part) => ({
  form: 'native',
  id: `${part}-native-in-disabled-fieldset`,
  isDisabled: false,
  part,
}))

// The triggers are enabled as far as Base UI is concerned; only the fieldset disables them.
const fieldsetScene = (): ReturnType<typeof h> =>
  h('fieldset', { disabled: true }, ...FIELDSET_CASES.map((one) => trigger(one)))

describe('AC-base-ui-bridge-55: the control sheet', () => {
  it('reds when the trigger rule has no :disabled branch to take out, so a control cannot pass on the built sheet', () => {
    const swapped = stylesheet.replace(NATIVE_BRANCH, '&[aria-disabled="true"], &:disabled{')
    expect(swapped, 'the built stylesheet has the key').not.toBe(stylesheet)
    expect(() => withoutNativeBranch(swapped)).toThrow(/the stylesheet has the key to take out/)
  })
})

describe('AC-base-ui-bridge-55: disabled disclosure trigger paint', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  const show = async (
    scheme: (typeof SCHEMES)[number],
    css: string,
    content: ReturnType<typeof h>,
  ): Promise<void> => {
    removeScheme = useScheme(scheme)
    removeSheets = useSheets(tokens, css)
    page = mount(content)
    await framesLater(3)
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    it.each(CASES)('$id computes the colour and cursor of its state', async (one) => {
      await show(scheme, stylesheet, scene())
      const wanted = one.isDisabled ? DISABLED : ENABLED
      expect(paint(one)).toEqual({ color: colorOf(wanted.token), cursor: wanted.cursor })
    })

    it('control: aria-disabled key alone leaves a native trigger enabled on 1.9.0', async () => {
      const previous = previousStylesheet()
      await show(scheme, previous, scene())
      expect(colorOf(DISABLED.token), 'the two colours differ, so the row can red').not.toBe(
        colorOf(ENABLED.token),
      )
      for (const one of DISABLED_CASES) {
        const isKeepingEnabledPaint = one.form === 'native' && !isFloor
        const wanted = isKeepingEnabledPaint ? ENABLED : DISABLED
        expect(paint(one), one.id).toEqual({ color: colorOf(wanted.token), cursor: wanted.cursor })
      }
    })

    it.each(FIELDSET_CASES)(
      '$id computes the disabled colour and cursor, as the browser treats the button',
      async (one) => {
        await show(scheme, stylesheet, fieldsetScene())
        expect(required(one.id).matches(':disabled'), 'the fieldset disables the button').toBe(true)
        expect(paint(one)).toEqual({ color: colorOf(DISABLED.token), cursor: DISABLED.cursor })
      },
    )

    it('control: aria-disabled key alone leaves a native trigger in a disabled fieldset enabled', async () => {
      const previous = previousStylesheet()
      await show(scheme, previous, fieldsetScene())
      expect(colorOf(DISABLED.token), 'the two colours differ, so the row can red').not.toBe(
        colorOf(ENABLED.token),
      )
      for (const one of FIELDSET_CASES) {
        expect(paint(one), one.id).toEqual({
          color: colorOf(ENABLED.token),
          cursor: ENABLED.cursor,
        })
      }
    })
  })
})
