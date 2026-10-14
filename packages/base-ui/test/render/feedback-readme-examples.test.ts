import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type ComponentType, createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { act, cleanup, render, user } from '../support/react.ts'
import { fencesOf, readReadme } from '../support/readme.ts'
import { PACKAGE_DIR } from '../support/stylesheet.ts'
import { settle } from '../support/w6-render.ts'

afterEach(cleanup)

// One directory per run, as the other README render test: the runs are separate workers.
const DIRECTORY = path.join(
  PACKAGE_DIR,
  'test/fixtures/readme-examples',
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
  `${process.env.NAVE_BASE_UI}-react-${process.env.NAVE_REACT}`,
)

const tsx = fencesOf(readReadme()).filter(({ language }) => language === 'tsx')
const toastFence = tsx.find(({ body }) => body.includes('Toast.createToastManager()'))
const navigationFence = tsx.find(({ body }) => body.includes('<NavigationMenu.Root'))

/**
The example as the README writes it, with the package's import specifiers pointed at its source.
 */
const toSource = (body: string): string =>
  body.replaceAll(/'@navecss\/base-ui\/([\w-]+)'/g, "'../../../../src/$1/index.ts'")

const load = async (name: string, body: string): Promise<Record<string, unknown>> => {
  mkdirSync(DIRECTORY, { recursive: true })
  const file = path.join(DIRECTORY, `feedback-${name}.tsx`)
  writeFileSync(file, toSource(body))
  return (await import(/* @vite-ignore */ file)) as Record<string, unknown>
}

const need = (fence: { body: string } | undefined, what: string): string => {
  expect(fence, `the README has a TSX fence for ${what}`).toBeDefined()
  return fence?.body ?? ''
}

const classesOf = (element: Element | null): string[] =>
  [...(element?.classList ?? [])]
    .filter((name) => name.startsWith('nave-base-ui-'))
    .toSorted((a, b) => a.localeCompare(b))

const one = (selector: string): HTMLElement => {
  const found = document.body.querySelectorAll<HTMLElement>(selector)
  expect(found, `exactly one ${selector}`).toHaveLength(1)
  return found[0]!
}

interface ToastManager {
  add: (options: { description: string; title: string }) => string
  close: () => void
}

const loadToast = async (): Promise<{
  Area: ComponentType<{ children?: ReactNode }>
  manager: ToastManager
}> => {
  const module = await load('toast', need(toastFence, 'D1'))
  return {
    Area: module.default as ComponentType<{ children?: ReactNode }>,
    manager: module.toastManager as ToastManager,
  }
}

const loadNavigation = async (body: string, name: string): Promise<ComponentType> => {
  const module = await load(name, body)
  return module.default as ComponentType
}

describe('AC-base-ui-feedback-navigation-52: the README examples render, and each styled part has its class (extends AC-base-ui-overlay-completion-42)', () => {
  describe('D1, the toast setup', () => {
    it('exports a manager made at module scope, and renders no toast before one is added', async () => {
      const { Area, manager } = await loadToast()
      expect(typeof manager.add).toBe('function')
      await render(createElement(Area, {}, createElement('p', {}, 'page')))
      expect(document.body.querySelector('.nave-base-ui-toast-root')).toBeNull()
    })

    it('renders a Toast.Root carrying toast-root, with the classes of Table P, for a toast added through the manager', async () => {
      const { Area, manager } = await loadToast()
      await render(createElement(Area, {}, createElement('p', {}, 'page')))
      await act(() => {
        manager.add({ description: 'Your changes were saved.', title: 'Saved' })
        return Promise.resolve()
      })
      await settle()
      const root = one('.nave-base-ui-toast-root')
      expect(classesOf(root)).toEqual([
        'nave-base-ui-toast-fade',
        'nave-base-ui-toast-limit',
        'nave-base-ui-toast-root',
      ])
      expect(classesOf(one('.nave-base-ui-toast-viewport'))).toEqual([
        'nave-base-ui-toast-placement',
        'nave-base-ui-toast-viewport',
      ])
      expect(root.contains(one('.nave-base-ui-title'))).toBe(true)
      expect(one('.nave-base-ui-title').tagName).toBe('H2')
      expect(one('.nave-base-ui-title').textContent).toBe('Saved')
      expect(one('.nave-base-ui-description').textContent).toBe('Your changes were saved.')
      expect(classesOf(one('button.nave-base-ui-button'))).toEqual(['nave-base-ui-button'])
      manager.close()
    })

    it('control: the toast is in the page because the manager added it, not because the fence renders one', async () => {
      const { Area, manager } = await loadToast()
      await render(createElement(Area))
      await settle()
      expect(document.body.querySelectorAll('.nave-base-ui-toast-root')).toHaveLength(0)
      expect(
        document.body.querySelectorAll('.nave-base-ui-toast-viewport').length,
      ).toBeLessThanOrEqual(1)
      await act(() => {
        manager.add({ description: 'd', title: 't' })
        return Promise.resolve()
      })
      await settle()
      expect(document.body.querySelectorAll('.nave-base-ui-toast-root')).toHaveLength(1)
      manager.close()
    })
  })

  describe('D7, the Navigation Menu', () => {
    it('renders a nav with a ul carrying the list class, the trigger and the icon with theirs, and the link outside the panel', async () => {
      const SiteNav = await loadNavigation(need(navigationFence, 'D7'), 'navigation')
      await render(createElement(SiteNav))
      const nav = one('nav')
      const list = nav.querySelector('ul')
      expect(list).not.toBeNull()
      expect(classesOf(list)).toEqual(['nave-base-ui-navigation-menu-list'])
      const trigger = one('button.nave-base-ui-navigation-menu-trigger')
      expect(classesOf(trigger)).toEqual(['nave-base-ui-navigation-menu-trigger'])
      expect(trigger.dataset.naveVariant).toBeUndefined()
      expect(trigger.dataset.naveSize).toBeUndefined()
      expect(classesOf(trigger.querySelector('.nave-base-ui-navigation-menu-icon'))).toEqual([
        'nave-base-ui-navigation-menu-icon',
      ])
      const blog = one('a[href="/blog"]')
      expect(classesOf(blog)).toContain('nave-base-ui-toolbar-link')
      expect(blog.hasAttribute('aria-current')).toBe(false)
    })

    it('renders its active link with aria-current="page" and the current-link class, once the panel is open', async () => {
      const SiteNav = await loadNavigation(need(navigationFence, 'D7'), 'navigation-open')
      await render(createElement(SiteNav))
      await user().click(one('button.nave-base-ui-navigation-menu-trigger'))
      await settle()
      const active = one('[aria-current="page"]')
      expect(active.tagName).toBe('A')
      expect(active.getAttribute('href')).toBe('/guides/start')
      expect(classesOf(active)).toEqual(
        expect.arrayContaining(['nave-base-ui-current-link', 'nave-base-ui-toolbar-link']),
      )
      const other = one('a[href="/guides/theming"]')
      expect(other.hasAttribute('aria-current')).toBe(false)
      expect(classesOf(one('.nave-base-ui-popover-popup'))).toEqual([
        'nave-base-ui-navigation-menu-fade',
        'nave-base-ui-popover-popup',
      ])
    })

    it("control: with the fence's `active` taken off, no link is the current page", async () => {
      const without = need(navigationFence, 'D7').replace(' active>', '>')
      expect(without).not.toBe(need(navigationFence, 'D7'))
      const SiteNav = await loadNavigation(without, 'navigation-inactive')
      await render(createElement(SiteNav))
      await user().click(one('button.nave-base-ui-navigation-menu-trigger'))
      await settle()
      expect(document.body.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
      expect(document.body.querySelectorAll('a[href="/guides/start"]')).toHaveLength(1)
    })
  })
})
