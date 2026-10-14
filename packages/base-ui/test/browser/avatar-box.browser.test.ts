/**
 * AC-base-ui-feedback-navigation-33, the Tier B clause: the Avatar's boxes, in headless Chromium
 * with the built tokens and stylesheet, through the built wrappers, in light and in dark.
 *
 * Roots at `size` sm, md and lg are 24, 32 and 48px square. A loaded image is 22, 30 and 46px
 * inside the 1px ring and covers its box; a broken image renders no `img`, and the Fallback fills
 * the same box in `--nave-color-surface-sunken` with initials at 12, 14 and 20px in
 * `--nave-color-content-primary`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { afterEach, describe, expect, it } from 'vitest'

import { Avatar } from '../../dist/avatar/index.js'
import { framesLater } from './support/frames.ts'
import {
  byTestId,
  el as h,
  mount,
  type Page,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { colorOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { parkPointer, required, waitUntil } from './support/w11-page.ts'

type Size = 'lg' | 'md' | 'sm'

interface Case {
  /**
  The box inside the 1px ring, in px.
   */
  readonly inside: number
  /**
  The initials' font size, in px.
   */
  readonly initials: number
  /**
  The Root's side, in px.
   */
  readonly root: number
  readonly size: Size
}

const cases: readonly Case[] = [
  { inside: 22, initials: 12, root: 24, size: 'sm' },
  { inside: 30, initials: 14, root: 32, size: 'md' },
  { inside: 46, initials: 20, root: 48, size: 'lg' },
]

/**
An image that loads, wider than it is tall so that covering a square box means something.
 */
const LOADS = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#c33"/></svg>')}`
/**
Bytes that are not an image, which the engine fails to decode.
 */
const BROKEN = 'data:image/png;base64,AAAA'

describe('AC-base-ui-feedback-navigation-33: the Avatar boxes', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  /**
  Mounts one Avatar and waits for the image to settle as loaded or failed.
   */
  const show = async (
    scheme: 'dark' | 'light',
    size: Size,
    src: string,
    outcome: 'error' | 'loaded',
  ): Promise<void> => {
    removeScheme = useScheme(scheme)
    removeSheets = useSheets(tokens, stylesheet)
    await parkPointer()
    const statuses: string[] = []
    page = mount(
      h(
        'div',
        { style: { padding: 24 } },
        h(
          Avatar.Root,
          { 'data-testid': 'root', size },
          h(Avatar.Image, {
            alt: '',
            'data-testid': 'image',
            onLoadingStatusChange: (status: string) => {
              statuses.push(status)
            },
            src,
          }),
          h(Avatar.Fallback, { 'data-testid': 'fallback' }, 'AB'),
        ),
      ),
    )
    await waitUntil(() => statuses.includes(outcome), `the image settled as ${outcome}`)
    await framesLater(5)
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each(cases)('size $size', ({ inside, initials, root, size }) => {
      it(`AC-base-ui-feedback-navigation-33: a ${size} Root is ${String(root)}px square, its loaded image ${String(inside)}px and covering`, async () => {
        await show(scheme, size, LOADS, 'loaded')
        const box = required('root').getBoundingClientRect()
        expect(box.width, 'Root width').toBeCloseTo(root, 2)
        expect(box.height, 'Root height').toBeCloseTo(root, 2)
        const image = required('image')
        expect(image.tagName, 'the loaded image is an img').toBe('IMG')
        const imageBox = image.getBoundingClientRect()
        expect(imageBox.width, 'image width').toBeCloseTo(inside, 2)
        expect(imageBox.height, 'image height').toBeCloseTo(inside, 2)
        expect(getComputedStyle(image).objectFit, 'the image covers its box').toBe('cover')
        expect(byTestId('fallback'), 'no Fallback renders over a loaded image').toBeUndefined()
      })

      it(`AC-base-ui-feedback-navigation-33: a ${size} Avatar with a broken image renders no img, and the Fallback fills the ${String(inside)}px box in the sunken surface with ${String(initials)}px initials`, async () => {
        await show(scheme, size, BROKEN, 'error')
        expect(required('root').querySelector('img'), 'no img is in the Avatar').toBeNull()
        const fallback = required('fallback')
        const box = fallback.getBoundingClientRect()
        expect(box.width, 'Fallback width').toBeCloseTo(inside, 2)
        expect(box.height, 'Fallback height').toBeCloseTo(inside, 2)
        const style = getComputedStyle(fallback)
        expect(style.backgroundColor, 'Fallback background').toBe(
          colorOf('var(--nave-color-surface-sunken)'),
        )
        expect(style.color, 'Fallback colour').toBe(colorOf('var(--nave-color-content-primary)'))
        expect(style.fontSize, 'Fallback font size').toBe(`${String(initials)}px`)
        const rootBox = required('root').getBoundingClientRect()
        expect(rootBox.width, 'Root width, as with an image').toBeCloseTo(root, 2)
        expect(rootBox.height, 'Root height, as with an image').toBeCloseTo(root, 2)
      })
    })
  })
})
