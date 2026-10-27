/**
 * What the whole-atoms rows read in Chromium and in a built app's stylesheets: the computed style
 * of the skip link and the button after Tab, the scratch plugin that splits an atom, and the files
 * a build wrote.
 */
import type { Page } from 'playwright'
import type { Plugin } from 'postcss'

import { atomClassMap } from '@navecss/core/atoms'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

import type { NextApp } from './next-app.ts'

import { computed } from './chromium.ts'

const PROPERTIES = ['outline-style', 'outline-width', 'width', 'clip-path'] as const

export type Computed = Record<(typeof PROPERTIES)[number], string>

export interface FocusStates {
  readonly button: Computed
  readonly skipLink: Computed
}

/**
 * The four computed properties of the element matching `selector`.
 */
async function readComputed(page: Page, selector: string): Promise<Computed> {
  const values = await Promise.all(PROPERTIES.map((property) => computed(page, selector, property)))
  return Object.fromEntries(
    PROPERTIES.map((property, index) => [property, values[index]]),
  ) as Computed
}

/**
 * The id of the element that has focus.
 */
function focusedId(page: Page): Promise<string> {
  return page.evaluate<string>('document.activeElement && document.activeElement.id')
}

/**
 * Loads the page, presses Tab to the skip link and reads it, presses Tab to the button and reads
 * that.
 */
export async function focusStatesAt(page: Page, origin: string): Promise<FocusStates> {
  await page.goto(origin)
  await page.keyboard.press('Tab')
  if ((await focusedId(page)) !== 'skip') throw new Error('Tab did not reach the skip link')
  const skipLink = await readComputed(page, '#skip')
  await page.keyboard.press('Tab')
  if ((await focusedId(page)) !== 'b') throw new Error('Tab did not reach the button')
  const button = await readComputed(page, '#b')
  return { button, skipLink }
}

/**
 * The classes of the atoms named, as selectors.
 */
function selectorsOf(atoms: readonly string[]): Set<string> {
  return new Set(atoms.map((name) => `.${(atomClassMap as Record<string, string>)[name]}`))
}

/**
 * A scratch plugin that keeps, in every `@layer atomic` block, only the rules whose selector is
 * exactly the class of an emitted atom. A nested `&:focus-visible` rule and a written-out
 * `.nave-focus-ring:focus-visible` rule are both dropped.
 */
function keepOnlyExactClasses(emitted: readonly string[]): Plugin {
  const exact = selectorsOf(emitted)
  return {
    postcssPlugin: 'keep-only-exact-classes',
    Once(root) {
      root.walkAtRules('layer', (block) => {
        if (block.params.trim() !== 'atomic' || block.nodes === undefined) return
        block.walkRules((rule) => {
          const kept = rule.selectors.filter((selector) => exact.has(selector.trim()))
          if (kept.length === 0) rule.remove()
          else rule.selectors = kept
        })
      })
    },
  }
}

/**
 * The CSS with only the rules whose selector is exactly an emitted atom's class kept in the
 * atomic layer.
 */
export function splitByScratchPlugin(css: string, emitted: readonly string[]): string {
  return postcss([keepOnlyExactClasses(emitted)]).process(css, { from: undefined }).css
}

/**
 * Every CSS file under the app's `.next/static`, by absolute path, in path order.
 */
export function cssFilesOf(app: NextApp): string[] {
  const root = path.join(app.dir, '.next/static')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * Rewrites every CSS file the build wrote through `rewrite`, in place.
 */
export function rewriteBuiltCss(app: NextApp, rewrite: (css: string) => string): void {
  for (const file of cssFilesOf(app)) writeFileSync(file, rewrite(readFileSync(file, 'utf8')))
}
