/**
 * What the feedback and navigation render tests share: the two wrapped namespaces, the one way a
 * part is made from a namespace, the waits that let Base UI open and animate, a test style sheet,
 * and the check of what an inline style may hold at rest. The scenes are in `w10-toast-scene.ts`
 * and `w10-navigation-scene.ts`; the recorder of what Base UI adds to the document is in
 * `w10-recorder.ts`.
 */
import { createElement, type ElementType, type ReactElement, type ReactNode } from 'react'

import { act } from './react.ts'

export type Ns = Record<string, unknown>
export type Props = Record<string, unknown>

export interface Feedback {
  readonly NavigationMenu: Ns
  readonly Toast: Ns
}

export const BASE = 'nave-base-ui-'

/**
The wrapped Toast and Navigation Menu of this package's source, over the run's Base UI.
 */
export const loadFeedback = async (): Promise<Feedback> => {
  const toast = await import('../../src/toast/index.ts')
  const navigationMenu = await import('../../src/navigation-menu/index.ts')
  return {
    NavigationMenu: navigationMenu.NavigationMenu as unknown as Ns,
    Toast: toast.Toast as unknown as Ns,
  }
}

/**
One part of a namespace as an element.
 */
export const part = (
  namespace: Ns,
  name: string,
  props: Props = {},
  ...children: ReactNode[]
): ReactElement => createElement(namespace[name] as ElementType, props, ...children)

/**
Waits, inside `act`, for what Base UI sets going after a render or an act: it opens a popup and
animates a toast a moment later, so a check made straight away would read a part as inactive
that was only slow.
 */
export const settle = (milliseconds = 100): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })

/**
Polls until the check passes, or throws naming what was waited for.
 */
export const until = async (
  description: string,
  isMet: () => boolean,
  timeout = 2000,
): Promise<void> => {
  for (let waited = 0; waited <= timeout; waited += 25) {
    if (isMet()) {
      return
    }
    await settle(25)
  }
  throw new Error(`timed out waiting for ${description}`)
}

export const inAct = (callback: () => void): Promise<void> =>
  act(() => {
    callback()
    return Promise.resolve()
  })

/**
A style sheet in the document head for the length of a test: jsdom runs a toast's or a popup's
exit through a transition only when a literal `transition-duration` applies to it.
 */
export const addStyleSheet = (text: string): void => {
  const style = document.createElement('style')
  style.dataset.testSheet = ''
  style.textContent = text
  document.head.append(style)
}

export const removeStyleSheets = (): void => {
  for (const style of document.head.querySelectorAll('style[data-test-sheet]')) {
    style.remove()
  }
}

const compareNames = (left: string, right: string): number => left.localeCompare(right)

/**
A list of names in a fixed order, to compare sets of classes.
 */
export const sorted = (names: readonly string[]): string[] => names.toSorted(compareNames)

/**
The class names an element carries that start with `nave-`, sorted.
 */
export const naveClasses = (element: Element | undefined): string[] =>
  sorted([...(element?.classList ?? [])].filter((name) => name.startsWith('nave-')))

const declarationsOf = (element: Element | undefined): Map<string, string> =>
  new Map(
    (element?.getAttribute('style') ?? '')
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const colon = declaration.indexOf(':')
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const
      }),
  )

/**
An element's inline style as property and value.
 */
export const inlineStyle = declarationsOf

const SINGLE_TRANSLATE = /^(?:none|translate(?:3d|X|Y|Z)?\([^()]*\))$/

/**
What an at-rest inline style may not hold: anything but translation. A fade, a scale, a rotation
or a filter would make the part a group that paints its content as one flat layer.
 */
export const nonTranslationStyles = (element: Element | undefined): string[] => {
  const styles = declarationsOf(element)
  const problems = ['opacity', 'filter', 'scale', 'rotate'].filter((name) => styles.has(name))
  const transform = styles.get('transform')
  if (transform !== undefined && !SINGLE_TRANSLATE.test(transform)) {
    problems.push(`transform: ${transform}`)
  }
  return problems
}
