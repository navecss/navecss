/**
 * Guard for condition C1 of the accessibility contrast assessment: `content.link`
 * against `content.primary` is 2.87:1 in light and 1.42:1 in dark, both below
 * 3:1 — SC 1.4.1 Level A. Nave avoids the obligation today rather than
 * meeting it: `reset.css` sets `a { color: inherit }` and strips no
 * `text-decoration`, so links keep the user-agent underline and are never
 * coloured by Nave at all. That is fragile: adding `text-decoration: none`
 * to `a` anywhere in the shipped CSS would silently remove the one
 * distinguishing cue colour cannot supply.
 *
 * This test says nothing about what a consumer writes in their own
 * stylesheet — only that no rule Nave itself ships strips `text-decoration`
 * from an anchor. It asserts against the BUILT output (every `dist/*.css`
 * file), not the source, so a rule reintroduced through any layer or build
 * path is caught, mirroring `reset-focus.test.ts`'s reason for existing:
 * it guards a deletion, and a deletion has no other way to defend itself.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const distCssFiles = readdirSync(DIST).filter((file) => file.endsWith('.css'))

/** Matches `text-decoration: none` (with or without !important), any casing;
 * also catches the longhand `text-decoration-line: none`. */
const REMOVES_DECORATION = /text-decoration(-line)?\s*:\s*none\b/i

/** A selector compound that targets the anchor element itself: a bare `a`,
 * optionally with pseudo-classes/attributes/classes/ids attached, as the
 * rightmost component of a (possibly descendant/child) selector. Does not
 * match tags that merely contain "a" (e.g. `abbr`, `area`, `.card`). */
const TARGETS_ANCHOR_ELEMENT = /(^|[\s>+~,])a(?=$|[.:#[\s>+~])/i

describe('shipped CSS never strips text-decoration on a', () => {
  it.each(distCssFiles)('dist/%s has no anchor rule removing text-decoration', (file) => {
    const css = readFileSync(path.join(DIST, file), 'utf8')
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkRules((rule) => {
      const ownsDecorationRemoval = rule.nodes.some(
        (node) => node.type === 'decl' && REMOVES_DECORATION.test(`${node.prop}: ${node.value}`),
      )
      if (!ownsDecorationRemoval) return

      const targetsAnchor = rule.selectors.some((selector) => TARGETS_ANCHOR_ELEMENT.test(selector))
      if (targetsAnchor) offenders.push(rule.selector)
    })

    expect(
      offenders,
      `anchor rules removing text-decoration in dist/${file}: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
