/**
 * The reset does not strip list semantics beyond the `ul[role='list']`
 * case. `reset.css` only removes `list-style` when `role="list"` is
 * present, because VoiceOver (Safari) drops list semantics when
 * list-style is removed unless role="list" signals intentional non-list
 * usage (Scott O'Hara / Andy Bell). A bare `ul`/`ol` rule stripping
 * list-style would silently defeat that scoping for every consumer of
 * the reset.
 *
 * Not expressible as a stylelint core rule:
 * `declaration-property-value-disallowed-list` keys on declarations and
 * cannot condition on the selector; `selector-disallowed-list` keys on
 * selectors and cannot condition on the declaration. Neither can say
 * "disallow list-style:none except under [role='list']". So the guard has
 * to be a test rather than a review: this is a property of a whole file
 * and is only as good as its last edit. It takes the shape of
 * reset-focus.test.ts / reset-link-decoration.test.ts: it asserts against
 * BUILT output, so a rule reintroduced through any layer or build path is
 * caught, not just the current instance in reset.css.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const distCssFiles = readdirSync(DIST).filter((file) => file.endsWith('.css'))

/** Matches `list-style: none` / `list-style-type: none` (with or without
 * !important), any casing. Does not match `list-style-position` or
 * `list-style-image`, which do not remove list semantics. */
const REMOVES_LIST_STYLE = /list-style(-type)?\s*:\s*none\b/i

/** A selector compound that targets `ul` or `ol` as the element itself
 * (not scoped further by an attribute, class or id), as the rightmost
 * component of a (possibly descendant/child) selector. Mirrors
 * TARGETS_ANCHOR_ELEMENT in reset-link-decoration.test.ts. */
const TARGETS_BARE_LIST_ELEMENT = /(^|[\s>+~,])(ul|ol)(?=$|[\s>+~,])/i

/** True if the selector carries a `[role='list']` (or `="list"`, unquoted,
 * any case) attribute qualifier, the one scoping the reset's list-style
 * removal requires. */
const HAS_ROLE_LIST_QUALIFIER = /\[role\s*=\s*['"]?list['"]?\]/i

describe('shipped CSS only strips list-style under [role="list"]', () => {
  it.each(distCssFiles)('dist/%s has no bare ul/ol rule removing list-style', (file) => {
    const css = readFileSync(path.join(DIST, file), 'utf8')
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkRules((rule) => {
      const ownsListStyleRemoval = rule.nodes.some(
        (node) => node.type === 'decl' && REMOVES_LIST_STYLE.test(`${node.prop}: ${node.value}`),
      )
      if (!ownsListStyleRemoval) return

      const targetsUnscopedList = rule.selectors.some(
        (selector) =>
          TARGETS_BARE_LIST_ELEMENT.test(selector) && !HAS_ROLE_LIST_QUALIFIER.test(selector),
      )
      if (targetsUnscopedList) offenders.push(rule.selector)
    })

    expect(
      offenders,
      `bare ul/ol rules removing list-style in dist/${file}: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
