/**
 * AC-base-ui-overlay-completion-50, the browser clause: a Menubar is v1's toolbar, so the
 * vertical one computes `flex-direction: column` and the horizontal one `row`, read in a real
 * engine with the built tokens and stylesheet, through the built wrappers.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactElement } from 'react'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Menu } from '../../dist/menu/index.js'
import { Menubar } from '../../dist/menubar/index.js'
import {
  byTestId,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'

const menu = (label: string): ReactElement =>
  h(
    Menu.Root,
    { key: label },
    h(Menu.Trigger, {}, label),
    h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, {}, h(Menu.Item, {}, 'New')))),
  )

describe('AC-base-ui-overlay-completion-50: the Menubar lays out as the toolbar does', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, stylesheet)
  })

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    page = undefined
  })

  it.each([
    { direction: 'row', orientation: 'horizontal' },
    { direction: 'column', orientation: 'vertical' },
  ] as const)(
    'AC-base-ui-overlay-completion-50: the $orientation Menubar computes flex-direction $direction',
    async ({ direction, orientation }) => {
      page = mount(
        h(Menubar, { 'data-testid': 'menubar', orientation }, menu('File'), menu('Edit')),
      )
      const root = (await settled(() => byTestId('menubar'))) as HTMLElement
      expect(root.getAttribute('aria-orientation'), 'the orientation reaches the root').toBe(
        orientation,
      )
      expect(getComputedStyle(root).display).toBe('flex')
      expect(getComputedStyle(root).flexDirection).toBe(direction)
    },
  )
})
