import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { loadingImages, settle } from '../support/feedback-render.ts'
import { feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'

afterEach(cleanup)

const C = 'nave-base-ui-'

const renderAvatar = async (props: Record<string, Props> = {}): Promise<void> => {
  const scene = scenes.avatar
  if (scene === undefined) {
    throw new Error('no scene for avatar')
  }
  await render(scene.render(await feedbackNave(), { props }))
  await settle(10)
}

const naveClassesOf = (element: Element | undefined): string[] =>
  (element?.className ?? '').split(/\s+/).filter((name) => name.startsWith('nave-'))

describe('AC-base-ui-feedback-navigation-33: Avatar (Tier A)', () => {
  it('renders the Root as a span with no role, carrying -avatar', async () => {
    await renderAvatar()
    const [root, ...rest] = partsNamed('Avatar.Root')
    expect(root, 'Avatar.Root rendered').toBeDefined()
    expect(rest).toEqual([])
    expect(root?.tagName).toBe('SPAN')
    expect(root?.hasAttribute('role')).toBe(false)
    expect(naveClassesOf(root)).toEqual([`${C}avatar`])
  })

  it('renders the Fallback and no img while the image has not loaded, the Fallback carrying -avatar-fallback', async () => {
    await renderAvatar()
    const [fallback] = partsNamed('Avatar.Fallback')
    expect(fallback, 'Avatar.Fallback rendered').toBeDefined()
    expect(fallback?.textContent).toBe('AB')
    expect(naveClassesOf(fallback)).toEqual([`${C}avatar-fallback`])
    expect(document.querySelector('img')).toBeNull()
    expect(partsNamed('Avatar.Image')).toEqual([])
  })

  it('renders the Image, carrying -avatar-image, and not the Fallback once the image has loaded', async () => {
    const restore = loadingImages()
    try {
      await renderAvatar()
      const [image] = partsNamed('Avatar.Image')
      expect(image?.tagName).toBe('IMG')
      expect(naveClassesOf(image)).toEqual([`${C}avatar-image`])
      expect(partsNamed('Avatar.Fallback')).toEqual([])
    } finally {
      restore()
    }
  })

  it('writes no alt: an Image passed alt renders that alt unchanged, and one passed none renders none', async () => {
    const restore = loadingImages()
    try {
      await renderAvatar({ 'Avatar.Image': { alt: 'Ada Lovelace' } })
      expect(partsNamed('Avatar.Image')[0]?.getAttribute('alt')).toBe('Ada Lovelace')
      await renderAvatar({ 'Avatar.Image': { alt: '' } })
      expect(partsNamed('Avatar.Image')[0]?.getAttribute('alt')).toBe('')
      await renderAvatar({ 'Avatar.Image': { alt: undefined } })
      const [image] = partsNamed('Avatar.Image')
      expect(image, 'the image rendered').toBeDefined()
      expect(image?.hasAttribute('alt')).toBe(false)
    } finally {
      restore()
    }
  })

  it('writes no alt, role or label on the Root or the Fallback either', async () => {
    await renderAvatar()
    for (const marker of ['Avatar.Root', 'Avatar.Fallback']) {
      const element = partsNamed(marker)[0]
      expect(element?.hasAttribute('alt'), marker).toBe(false)
      expect(element?.hasAttribute('role'), marker).toBe(false)
      expect(element?.hasAttribute('aria-label'), marker).toBe(false)
    }
  })
})
