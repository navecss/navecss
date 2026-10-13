/**
 * What the overlay tests read out of the page's own style engine: a token or an expression
 * resolved to the value the engine computes for it, the colour scheme the page resolves
 * `light-dark()` in, the focus ring's width and offset, and the forced-colours emulation.
 */
import { atoms } from '@navecss/core/atoms'
import { cdp } from 'vitest/browser'

export type Scheme = 'dark' | 'light'

export const SCHEMES: readonly Scheme[] = ['light', 'dark']

/**
Puts the page in a colour scheme, which is what `light-dark()` in the built tokens resolves
against, and returns the function that puts it back.
 */
export const useScheme = (scheme: Scheme): (() => void) => {
  const root = document.documentElement
  const previous = root.style.colorScheme
  root.style.colorScheme = scheme
  return () => {
    root.style.colorScheme = previous
  }
}

/**
A computed length in px, as a number.
 */
export const px = (value: string): number => Number(value.replace('px', ''))

const probe = (
  property: string,
  value: string,
): { readonly computed: CSSStyleDeclaration; readonly remove: () => void } => {
  const element = document.createElement('div')
  element.style.setProperty('position', 'fixed')
  element.style.setProperty('visibility', 'hidden')
  element.style.setProperty(property, value)
  document.body.append(element)
  return { computed: getComputedStyle(element), remove: () => element.remove() }
}

/**
The colour an expression (a `var()` of a token, say) computes to, as the engine serialises it.
 */
export const colorOf = (expression: string): string => {
  const { computed, remove } = probe('color', expression)
  const color = computed.color
  remove()
  return color
}

/**
The length, in CSS px, an expression computes to.
 */
export const lengthOf = (expression: string): number => {
  const { computed, remove } = probe('inline-size', expression)
  const length = px(computed.inlineSize)
  remove()
  return length
}

/**
The focus ring's width W and offset O, from the ring `@navecss/core` ships.
 */
export const ring = (): { readonly offset: number; readonly width: number } => {
  const block = atoms.focusRing.pseudos[':focus-visible']
  return { offset: lengthOf(block['outline-offset']), width: lengthOf(block['outline-width']) }
}

/**
Emulates forced colours (or none) on the page and checks the page took it.
 */
export const emulateForcedColors = async (value: 'active' | 'none'): Promise<void> => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value }],
  })
  const isForced = globalThis.matchMedia('(forced-colors: active)').matches
  if (isForced !== (value === 'active')) {
    throw new Error(`emulating forced colours ${value} did not reach the page`)
  }
}
