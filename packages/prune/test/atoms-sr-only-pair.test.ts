import { describe, expect, it } from 'vitest'

import type { Scenario } from './helpers/atoms-fixture.ts'

import {
  CX_IMPORT,
  manifest,
  PLAIN_LAYOUT,
  PLAIN_PAGE,
  runScenario,
  useScratchProjects,
} from './helpers/atoms-fixture.ts'
import { atomsNamedBy, compareLayers, flattenAtomic } from './helpers/atoms-flatten.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

const PAIR = ['srOnly', 'srOnlyFocusable']

/**
 * A scenario whose only file the plugin reads is a page, plus whatever else `more` adds.
 */
function scenario(page: string, more: Partial<Scenario> = {}): Scenario {
  const { files = {}, ...rest } = more
  return { files: { 'app/layout.tsx': PLAIN_LAYOUT, 'app/page.tsx': page, ...files }, ...rest }
}

/**
 * A dependency whose `react-server` condition picks `server.js`, which calls `call`; the file
 * every other condition picks calls nothing.
 */
function okLib(call: string): Record<string, string> {
  return {
    'client.js': 'export const label = "client"',
    'package.json': manifest('ok-lib', {
      '.': { 'react-server': './server.js', default: './client.js' },
    }),
    'server.js': `${CX_IMPORT}\nexport const label = ${call}`,
  }
}

/**
 * A route handler running on the edge runtime that calls `call`.
 */
function edgeRoute(call: string): string {
  return [
    CX_IMPORT,
    "export const runtime = 'edge'",
    `export function GET() { return new Response(${call}) }`,
  ].join('\n')
}

/**
 * A Pages Router page that renders an element whose class list is `call`.
 */
function legacyPage(call: string): string {
  return [CX_IMPORT, `export default function Legacy() { return <p className={${call}} /> }`].join(
    '\n',
  )
}

/**
 * The states S2 to S8, each as the scenario with its only use, and the same scenario without it.
 */
const STATES: Record<string, { control: Scenario; use: Scenario }> = {
  S2: {
    control: scenario("import Widget from '@/components/Widget'\nexport default Widget", {
      files: {
        'components/Widget.tsx': [
          "'use client'",
          CX_IMPORT,
          "export default function Widget() { return <span className={cx('flex')} /> }",
        ].join('\n'),
      },
    }),
    use: scenario("import Widget from '@/components/Widget'\nexport default Widget", {
      files: {
        'components/Widget.tsx': [
          "'use client'",
          CX_IMPORT,
          "export default function Widget() { return <span className={cx('srOnly')} /> }",
        ].join('\n'),
      },
    }),
  },
  S3: {
    control: scenario('export default function Page() { return <p className="plain" /> }'),
    use: scenario('export default function Page() { return <p className="nave-sr-only" /> }'),
  },
  S4: {
    control: scenario(PLAIN_PAGE),
    use: scenario(PLAIN_PAGE, { options: { keep: ['srOnly'] } }),
  },
  S5: {
    control: scenario("import 'kf-lib'\nexport default function Page() { return <main /> }", {
      options: { keepFor: { 'kf-lib': ['flex'] } },
      packages: {
        'kf-lib': {
          'index.js': 'export const label = 1',
          'package.json': manifest('kf-lib', './index.js'),
        },
      },
    }),
    use: scenario("import 'kf-lib'\nexport default function Page() { return <main /> }", {
      options: { keepFor: { 'kf-lib': ['srOnly'] } },
      packages: {
        'kf-lib': {
          'index.js': 'export const label = 1',
          'package.json': manifest('kf-lib', './index.js'),
        },
      },
    }),
  },
  S6: {
    control: scenario("import { label } from 'ok-lib'\nexport default () => <main>{label}</main>", {
      packages: { 'ok-lib': okLib("cx('flex')") },
    }),
    use: scenario("import { label } from 'ok-lib'\nexport default () => <main>{label}</main>", {
      packages: { 'ok-lib': okLib("cx('srOnly')") },
    }),
  },
  S7: {
    control: scenario(PLAIN_PAGE, { files: { 'app/api/e/route.ts': edgeRoute("cx('flex')") } }),
    use: scenario(PLAIN_PAGE, { files: { 'app/api/e/route.ts': edgeRoute("cx('srOnly')") } }),
  },
  S8: {
    control: scenario(PLAIN_PAGE, { files: { 'pages/legacy.tsx': legacyPage("cx('flex')") } }),
    use: scenario(PLAIN_PAGE, { files: { 'pages/legacy.tsx': legacyPage("cx('srOnly')") } }),
  },
}

/**
 * The entries of the trimmed layer that name an atom of the pair, by atom name.
 */
function pairEntries(css: string): string[] {
  return flattenAtomic(css).flatMap((entry) =>
    atomsNamedBy(entry.selector).filter((atom) => PAIR.includes(atom)),
  )
}

describe('AC-nextjs-used-atoms-34 whichever source puts srOnly in the set', () => {
  const create = useScratchProjects()

  it('AC-nextjs-used-atoms-34 S1 ships srOnlyFocusable whole and no entry for srOnly', async () => {
    const { css, project } = await runScenario(
      create,
      scenario(
        [
          CX_IMPORT,
          'export default function Page() { return <a href="#main" className={cx(\'srOnlyFocusable\')} /> }',
        ].join('\n'),
      ),
    )
    expect(compareLayers(css, ATOMIC_CSS, ['srOnlyFocusable'])).toEqual({
      missing: [],
      outside: [],
      unexpected: [],
    })
    expect(pairEntries(css).length).toBeGreaterThan(0)
    expect(pairEntries(css).filter((atom) => atom === 'srOnly')).toEqual([])
    expect(recordOf(project).atoms).toEqual(['srOnlyFocusable'])
  })

  it('AC-nextjs-used-atoms-34 control: S1 without its use ships neither atom', async () => {
    const { css } = await runScenario(create, scenario(PLAIN_PAGE))
    expect(pairEntries(css)).toEqual([])
  })

  it('AC-nextjs-used-atoms-34 control: the full layer has entries for srOnly', () => {
    expect(pairEntries(ATOMIC_CSS)).toContain('srOnly')
    expect(pairEntries(ATOMIC_CSS)).toContain('srOnlyFocusable')
  })

  describe.each(Object.entries(STATES))('%s', (state, { control, use }) => {
    it(`AC-nextjs-used-atoms-34 ${state} ships srOnly and srOnlyFocusable whole`, async () => {
      const { css } = await runScenario(create, use)
      expect(compareLayers(css, ATOMIC_CSS, PAIR)).toEqual({
        missing: [],
        outside: [],
        unexpected: [],
      })
      expect(new Set(pairEntries(css))).toEqual(new Set(PAIR))
    })

    it(`AC-nextjs-used-atoms-34 ${state} lists both atoms in the record`, async () => {
      const { project } = await runScenario(create, use)
      expect(recordOf(project).atoms).toEqual(expect.arrayContaining(PAIR))
    })

    it(`AC-nextjs-used-atoms-34 control: ${state} without its use ships neither atom`, async () => {
      const { css } = await runScenario(create, control)
      expect(pairEntries(css)).toEqual([])
    })
  })

  it('AC-nextjs-used-atoms-34 S6 control: a package that calls cx(srOnly) ships it only when it is imported', async () => {
    const { css } = await runScenario(
      create,
      scenario(PLAIN_PAGE, { packages: { 'ok-lib': okLib("cx('srOnly')") } }),
    )
    expect(pairEntries(css)).toEqual([])
  })

  it('AC-nextjs-used-atoms-34 S5 control: with no keepFor entry neither atom of the pair ships', async () => {
    const { css } = await runScenario(
      create,
      scenario(PLAIN_PAGE, {
        packages: {
          'kf-lib': {
            'index.js': 'export const label = 1',
            'package.json': manifest('kf-lib', './index.js'),
          },
        },
      }),
    )
    expect(pairEntries(css)).toEqual([])
  })
})
