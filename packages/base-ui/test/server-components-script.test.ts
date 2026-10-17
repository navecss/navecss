import { describe, expect, it } from 'vitest'

import {
  htmlProblems,
  KNOWN_ERRORS,
  logProblems,
  ROUTES,
} from '../scripts/check-server-components.ts'

describe('AC-base-ui-bridge-53: the release-time Server Component check reads a build the way the criterion says', () => {
  it('builds the four routes, only the last of them starting with the directive', () => {
    expect(ROUTES.map((route) => route.name)).toEqual(['namespace', 'single', 'root', 'client'])
    expect(
      ROUTES.filter((route) => route.source.startsWith("'use client'")).map((route) => route.name),
    ).toEqual(['client'])
  })

  it('renders a Dialog and an Accordion from a subpath, a Button, and a Dialog from the root', () => {
    const source = (name: string): string =>
      ROUTES.find((route) => route.name === name)?.source ?? ''
    expect(source('namespace')).toContain("from '@navecss/base-ui/dialog'")
    expect(source('namespace')).toContain('<Accordion.Root>')
    expect(source('single')).toContain("from '@navecss/base-ui/button'")
    expect(source('root')).toContain("import { Dialog } from '@navecss/base-ui'")
  })

  it('reports each of the three errors the shipped 0.2.0 printed', () => {
    for (const message of KNOWN_ERRORS) {
      expect(logProblems(`before\n${message} (details)\nafter`)).toEqual([
        `the log contains "${message}"`,
      ])
    }
    expect(KNOWN_ERRORS).toHaveLength(3)
  })

  it('control: a log with none of them is clean', () => {
    expect(logProblems('Compiled successfully\n○ (Static) prerendered as static content')).toEqual(
      [],
    )
  })

  it('wants a primary button on every route but the client one, and the Accordion on the namespace route', () => {
    const button = '<button type="button" data-nave-variant="primary">Open</button>'
    const accordion = '<div class="nave-base-ui-accordion-root"></div>'
    expect(htmlProblems('namespace', button + accordion)).toEqual([])
    expect(htmlProblems('single', button)).toEqual([])
    expect(htmlProblems('root', button)).toEqual([])
    expect(htmlProblems('namespace', accordion)).toEqual([
      'namespace: no <button> with data-nave-variant="primary"',
    ])
    expect(htmlProblems('namespace', button)).toEqual([
      'namespace: no element with a class of the Accordion',
    ])
    expect(htmlProblems('single', '<button type="button">Save</button>')).toEqual([
      'single: no <button> with data-nave-variant="primary"',
    ])
  })
})
