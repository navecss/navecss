/**
 * Helpers the render rows share: rendering a component's scene through the wrapper with props by
 * part, finding a part's element, and the two questions a row asks of it (does it carry an
 * attribute or variable, and does it carry the class).
 */
import type { Props, Source } from './scenes.ts'

import { partsNamed } from './dom.ts'
import { render } from './react.ts'
import { scenes } from './scenes.ts'

export const renderScene = async (
  source: Source,
  subpath: string,
  props: Record<string, Props> = {},
): Promise<void> => {
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  await render(scene.render(source, { props }))
}

/**
The first element carrying a part's marker.
 */
export const part = (marker: string): HTMLElement | undefined => partsNamed(marker)[0]

/**
Whether the element carries the attribute (with the value, when one is given) or, for a custom
property, whether its inline style sets it.
 */
export const carries = (element: Element | undefined, item: string, value?: string): boolean => {
  if (element === undefined) {
    return false
  }
  if (item.startsWith('--')) {
    return (element.getAttribute('style') ?? '').includes(`${item}:`)
  }
  return value === undefined ? element.hasAttribute(item) : element.getAttribute(item) === value
}

export const hasClass = (element: Element | undefined, name: string): boolean =>
  element?.classList.contains(name) ?? false
