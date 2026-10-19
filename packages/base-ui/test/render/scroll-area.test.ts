import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { overflowingLayout, settle } from '../support/feedback-render.ts'
import { feedbackBare, feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { tableP } from '../support/table-p.ts'
import { FLOOR_MINOR, runMinor } from '../support/w6-minors.ts'

afterEach(cleanup)

const C = 'nave-base-ui-'

const renderScrollArea = async (
  isWrapped: boolean,
  props: Record<string, Props> = {},
): Promise<void> => {
  const scene = scenes['scroll-area']
  if (scene === undefined) {
    throw new Error('no scene for scroll-area')
  }
  await render(scene.render(await (isWrapped ? feedbackNave() : feedbackBare()), { props }))
  await settle(10)
}

const styleOf = (marker: string): (string | null)[] =>
  partsNamed(marker).map((element) => element.getAttribute('style'))

const inlineStyle = (element: HTMLElement | undefined, property: string): string =>
  element?.style.getPropertyValue(property) ?? ''

describe("AC-base-ui-feedback-navigation-28: what Base UI renders on the Scroll Area's parts (Tier A)", () => {
  // Base UI 1.9.0 took the Viewport's `role="presentation"` away; the floor run still reads it.
  const viewportRole = runMinor().version === FLOOR_MINOR.version ? 'presentation' : undefined

  it(`gives the Viewport ${viewportRole === undefined ? 'no role' : 'role="presentation"'}, an inline overflow: scroll and tabindex="-1" while nothing overflows`, async () => {
    await renderScrollArea(true)
    const [viewport, ...rest] = partsNamed('ScrollArea.Viewport')
    expect(viewport, 'ScrollArea.Viewport rendered').toBeDefined()
    expect(rest).toEqual([])
    expect(viewport?.getAttribute('role') ?? undefined).toBe(viewportRole)
    expect(inlineStyle(viewport, 'overflow')).toBe('scroll')
    expect(viewport?.getAttribute('tabindex')).toBe('-1')
    // Nothing overflows, and the overflow attributes are absent.
    expect(viewport?.hasAttribute('data-has-overflow-x')).toBe(false)
    expect(viewport?.hasAttribute('data-has-overflow-y')).toBe(false)
  })

  it("gives the Viewport Base UI's own class beside the wrapper's", async () => {
    await renderScrollArea(true)
    const viewport = partsNamed('ScrollArea.Viewport')[0]
    expect(viewport?.classList.contains('base-ui-disable-scrollbar')).toBe(true)
    expect(viewport?.classList.contains(`${C}scroll-area-viewport`)).toBe(true)
  })

  it('gives the Root an inline position: relative', async () => {
    await renderScrollArea(true)
    expect(inlineStyle(partsNamed('ScrollArea.Root')[0], 'position')).toBe('relative')
  })

  it('gives each Scrollbar and Thumb data-orientation equal to its orientation, and each Scrollbar an inline position: absolute', async () => {
    await renderScrollArea(true)
    const scrollbars = partsNamed('ScrollArea.Scrollbar')
    const thumbs = partsNamed('ScrollArea.Thumb')
    expect(scrollbars.map((element) => element.dataset.orientation)).toEqual([
      'vertical',
      'horizontal',
    ])
    expect(thumbs.map((element) => element.dataset.orientation)).toEqual(['vertical', 'horizontal'])
    for (const scrollbar of scrollbars) {
      expect(inlineStyle(scrollbar, 'position')).toBe('absolute')
    }
  })

  it('renders the same inline styles as the bare parts: the wrapper adds a class and nothing else', async () => {
    const markers = [
      'ScrollArea.Root',
      'ScrollArea.Viewport',
      'ScrollArea.Scrollbar',
      'ScrollArea.Thumb',
    ]
    await renderScrollArea(false)
    const bare = markers.map((marker) => styleOf(marker))
    await renderScrollArea(true)
    expect(markers.map((marker) => styleOf(marker))).toEqual(bare)
    // The control: the parts did carry styles to compare.
    expect(bare.flat().every((style) => style !== null)).toBe(true)
  })

  it('takes the classes of Table P', async () => {
    await renderScrollArea(true)
    for (const [marker, expected] of [
      ['ScrollArea.Root', [`${C}scroll-area`]],
      ['ScrollArea.Viewport', [`${C}scroll-area-viewport`]],
      ['ScrollArea.Scrollbar', [`${C}scroll-area-scrollbar`]],
      ['ScrollArea.Thumb', [`${C}scroll-area-thumb`]],
    ] as const) {
      expect(tableP.get(marker), marker).toEqual(expected)
      for (const element of partsNamed(marker)) {
        expect(
          element.className.split(/\s+/).filter((name) => name.startsWith('nave-')),
          marker,
        ).toEqual(expected)
      }
    }
    // Content is a pass-through: it takes none.
    expect(partsNamed('ScrollArea.Content')[0]?.className ?? '').not.toContain('nave-')
  })

  it('stands in for the browser\'s layout (not credited as the Tier B row): an overflowing Viewport carries both overflow attributes and tabindex="0", a fitting one neither and tabindex="-1"', async () => {
    const restore = overflowingLayout()
    try {
      await renderScrollArea(true)
      const viewport = partsNamed('ScrollArea.Viewport')[0]
      expect(viewport?.hasAttribute('data-has-overflow-x')).toBe(true)
      expect(viewport?.hasAttribute('data-has-overflow-y')).toBe(true)
      expect(viewport?.getAttribute('tabindex')).toBe('0')
    } finally {
      restore()
    }
    await renderScrollArea(true)
    const fitting = partsNamed('ScrollArea.Viewport')[0]
    expect(fitting?.hasAttribute('data-has-overflow-x')).toBe(false)
    expect(fitting?.hasAttribute('data-has-overflow-y')).toBe(false)
    expect(fitting?.getAttribute('tabindex')).toBe('-1')
  })
})
