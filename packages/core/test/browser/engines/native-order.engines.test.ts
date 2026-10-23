/**
 * AC-native-apply-order-43: built output computes the new outcomes in three real engines. Each row
 * of `native-order-engine-rows.ts` is built by the Vite plugin (default transformer) and by the
 * PostCSS host (`scripts/generate-native-order-engine-fixtures.ts`), and rendered in Chromium,
 * Firefox and WebKit as Playwright ships them. They are current releases, not the supported floor:
 * this proves the emitted CSS, not the floor. Runs from `vitest.browser.engines.config.ts` only.
 */
import { describe, expect, it } from 'vitest'

import { ENGINE_ROWS } from '../../helpers/native-order-engine-rows.ts'
import { computed } from '../native-order-mount.ts'

const BUILDS = import.meta.glob('../fixtures/engines/*.css', {
  eager: true,
  import: 'default',
  query: '?raw',
})

const HOSTS = ['vite', 'postcss'] as const

/**
 * The stylesheet `host` built for the row at `index`.
 */
function builtBy(host: (typeof HOSTS)[number], index: number): string {
  const css = BUILDS[`../fixtures/engines/${index}-${host}.css`]
  if (css === undefined) throw new Error(`no ${host} build of row ${index}`)
  return css
}

describe('AC-native-apply-order-43 - the fixtures hold every row', () => {
  it('has one build of each row by each host, and nothing else', () => {
    expect(Object.keys(BUILDS)).toHaveLength(ENGINE_ROWS.length * HOSTS.length)
    for (const index of ENGINE_ROWS.keys()) {
      for (const host of HOSTS) expect(builtBy(host, index).trim()).not.toBe('')
    }
  })

  it('has built no directive into any output', () => {
    for (const css of Object.values(BUILDS)) expect(css).not.toContain('@nave')
  })
})

describe('AC-native-apply-order-43 - a control: the rows can fail', () => {
  it('a block placed after the declaration, as the release before this one printed it, hides the element', async () => {
    const css = '.x { display: flex; @media (width < 37.5em) { & { display: none } } }'
    const placement = { focused: false, html: '<div class="x">x</div>', selector: '.x', width: 375 }

    expect(await computed(css, placement, 'display')).toBe('none')
  })

  it('the same block does not apply above its condition', async () => {
    const css = '.x { display: flex; @media (width < 37.5em) { & { display: none } } }'
    const placement = { focused: false, html: '<div class="x">x</div>', selector: '.x', width: 700 }

    expect(await computed(css, placement, 'display')).toBe('flex')
  })
})

describe.each(HOSTS)('AC-native-apply-order-43 - the %s build', (host) => {
  describe.each(ENGINE_ROWS.map((row, index) => [row.id, row, index] as const))(
    '%s',
    (_id, row, index) => {
      it.each(row.checks)('$selector at $width px computes $property: $value', async (check) => {
        const css = builtBy(host, index)

        expect(await computed(css, check, check.property)).toBe(check.value)
      })
    },
  )
})
