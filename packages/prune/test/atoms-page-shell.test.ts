import { describe, expect, it } from 'vitest'

import type { Scenario } from './helpers/atoms-fixture.ts'

import {
  CX_IMPORT,
  PLAIN_LAYOUT,
  PLAIN_PAGE,
  runScenario,
  useScratchProjects,
} from './helpers/atoms-fixture.ts'
import { atomsNamedBy, compareLayers, flattenAtomic } from './helpers/atoms-flatten.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

interface Shell {
  /**
   * The atoms the state emits when its skip link is in place.
   */
  readonly emitted: readonly string[]
  /**
   * The state with its skip link in place when true, and with the link left plain when false.
   */
  readonly build: (hasLink: boolean) => Scenario
}

const PLAIN_LINK = '<a href="#main">Skip to content</a>'

/**
 * A root layout with `link` before its children.
 */
function layoutWith(link: string): string {
  return [
    'export default function Layout({ children }) {',
    ['  return <html><body>', link, '{children}</body></html>'].join(''),
    '}',
  ].join('\n')
}

/**
 * A skip link whose class attribute is a string spanning two lines.
 */
function brokenStringLink(hasLink: boolean): string {
  if (!hasLink) return PLAIN_LINK
  return '<a href="#main" className="skip\nnave-sr-only-focusable">Skip to content</a>'
}

/**
 * A skip link whose class list is a template literal spanning two lines.
 */
function brokenTemplateLink(hasLink: boolean): string {
  if (!hasLink) return PLAIN_LINK
  return '<a href="#main" className={`skip \nnave-sr-only-focusable`}>Skip to content</a>'
}

/**
 * A skip link written with both classes of the two-class idiom.
 */
function twoClassLink(hasLink: boolean): string {
  if (!hasLink) return PLAIN_LINK
  return '<a href="#main" className="nave-sr-only nave-sr-only-focusable">Skip to content</a>'
}

/**
 * The page shells the plugin must read, one per way a skip link reaches the build.
 */
const SHELLS: Record<string, Shell> = {
  D1: {
    build: (hasLink) => ({
      files: {
        'pages/_document.tsx': [
          "import { Head, Html, Main, NextScript } from 'next/document'",
          'export default function Document() {',
          `  return <Html><Head /><body>${twoClassLink(hasLink)}<Main /><NextScript /></body></Html>`,
          '}',
        ].join('\n'),
        'pages/legacy.tsx': PLAIN_PAGE,
      },
    }),
    emitted: ['srOnly', 'srOnlyFocusable'],
  },
  G1: {
    build: (hasLink) => ({
      files: {
        'app/global-not-found.tsx': [
          'export default function GlobalNotFound() {',
          `  return <html><body>${brokenStringLink(hasLink)}<h1>Not found</h1></body></html>`,
          '}',
        ].join('\n'),
        'app/layout.tsx': PLAIN_LAYOUT,
        'app/page.tsx': PLAIN_PAGE,
      },
    }),
    emitted: ['srOnlyFocusable'],
  },
  L1: {
    build: (hasLink) => ({
      files: {
        'app/layout.tsx': layoutWith(brokenStringLink(hasLink)),
        'app/page.tsx': PLAIN_PAGE,
      },
    }),
    emitted: ['srOnlyFocusable'],
  },
  L2: {
    build: (hasLink) => ({
      files: {
        'app/layout.tsx': layoutWith(brokenTemplateLink(hasLink)),
        'app/page.tsx': PLAIN_PAGE,
      },
    }),
    emitted: ['srOnlyFocusable'],
  },
  T1: {
    build: (hasLink) => ({
      files: {
        'app/layout.tsx': layoutWith(twoClassLink(hasLink)),
        'app/page.tsx': [
          "import { Visually } from '@/components/Visually'",
          'export default function Page() { return <Visually /> }',
        ].join('\n'),
        'components/Visually.tsx': [
          CX_IMPORT,
          "export function Visually() { return <span className={cx('srOnly')} /> }",
        ].join('\n'),
      },
    }),
    emitted: ['srOnly', 'srOnlyFocusable'],
  },
}

/**
 * The atoms of the entries in the layer, by atom name, without repeats.
 */
function atomsShipped(css: string): string[] {
  const names = flattenAtomic(css).flatMap((entry) => atomsNamedBy(entry.selector))
  return [...new Set(names)].toSorted((a, b) => a.localeCompare(b))
}

describe('AC-nextjs-used-atoms-37 the page shell is read', () => {
  const create = useScratchProjects()

  describe.each(Object.entries(SHELLS))('%s', (state, shell) => {
    it(`AC-nextjs-used-atoms-37 ${state} ships srOnlyFocusable whole`, async () => {
      const { css, project } = await runScenario(create, shell.build(true))
      expect(compareLayers(css, ATOMIC_CSS, shell.emitted)).toEqual({
        missing: [],
        outside: [],
        unexpected: [],
      })
      expect(atomsShipped(css)).toEqual(shell.emitted)
      expect(recordOf(project).atoms).toEqual(shell.emitted)
    })

    it(`AC-nextjs-used-atoms-37 control: ${state} with its skip link removed ships no srOnlyFocusable`, async () => {
      const { css } = await runScenario(create, shell.build(false))
      expect(atomsShipped(css)).not.toContain('srOnlyFocusable')
    })
  })

  it('AC-nextjs-used-atoms-37 control: T1 with its skip link removed still ships srOnly alone', async () => {
    const { css } = await runScenario(create, SHELLS.T1!.build(false))
    expect(atomsShipped(css)).toEqual(['srOnly'])
  })

  it('AC-nextjs-used-atoms-37 control: the full layer holds srOnlyFocusable entries', () => {
    expect(atomsShipped(ATOMIC_CSS)).toContain('srOnlyFocusable')
  })
})
