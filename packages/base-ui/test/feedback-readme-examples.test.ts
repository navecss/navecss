import { describe, expect, it } from 'vitest'

import { fencesOf, readReadme } from './support/readme.ts'
import { compile } from './support/type-fixtures.ts'

const readme = readReadme()
const tsx = fencesOf(readme).filter(({ language }) => language === 'tsx')

const toastExample = tsx.find(({ body }) => body.includes('Toast.createToastManager()'))
const navigationExample = tsx.find(({ body }) => body.includes('<NavigationMenu.Root'))

const needed = (
  fence: { body: string } | undefined,
  what: string,
): { body: string; language: string } => {
  expect(fence, `the README has a TSX fence for ${what}`).toBeDefined()
  return { body: fence?.body ?? '', language: 'tsx' }
}

const files = (...list: readonly { body: string }[]): Record<string, string> =>
  Object.fromEntries(list.map(({ body }, index) => [`example-${index}.tsx`, body]))

/**
D7's fence with the trigger given the props written.
 */
const navigationWith = (props: string): { body: string } => ({
  body: [
    "import { NavigationMenu } from '@navecss/base-ui/navigation-menu'",
    'export default function Planted() {',
    '  return (',
    '    <NavigationMenu.Root>',
    '      <NavigationMenu.List>',
    '        <NavigationMenu.Item>',
    `          <NavigationMenu.Trigger${props}>Guides</NavigationMenu.Trigger>`,
    '        </NavigationMenu.Item>',
    '      </NavigationMenu.List>',
    '    </NavigationMenu.Root>',
    '  )',
    '}',
  ].join('\n'),
})

describe("AC-base-ui-feedback-navigation-52: the README's examples are true against the shipped package (extends AC-base-ui-overlay-completion-42)", () => {
  it('has a fence for D1 and one for D7, each a component the render test can mount', () => {
    for (const [fence, what] of [
      [toastExample, 'D1, the toast setup'],
      [navigationExample, 'D7, the Navigation Menu'],
    ] as const) {
      expect(needed(fence, what).body).toMatch(/export default function \w+\(/)
    }
  })

  it("starts D1's fence with 'use client' and creates the manager at module scope", () => {
    const { body } = needed(toastExample, 'D1')
    expect(body.split('\n', 1)[0]).toBe("'use client'")
    expect(body).toMatch(/^export const toastManager = Toast\.createToastManager\(\)$/m)
    expect(body).toMatch(/from '@navecss\/base-ui\/toast'/)
  })

  it('has every TSX fence of the README import only from this package or React, never a Nave class', () => {
    for (const { body } of tsx) {
      expect(body).not.toMatch(/nave-base-ui-|data-nave-/)
    }
  })

  it.each(['current', 'floor'] as const)(
    'typechecks D1 and D7 under strict against the built package with Base UI at %s',
    async (version) => {
      const result = await compile(
        `feedback-readme-examples-${version}`,
        files(needed(toastExample, 'D1'), needed(navigationExample, 'D7')),
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )

  it('control: a fence passing variant="ghost" to NavigationMenu.Trigger fails to typecheck, for that prop', async () => {
    const result = await compile(
      'feedback-readme-examples-ghost',
      files(navigationWith(' variant="ghost"')),
      'current',
    )
    expect(result.output).not.toMatch(/Cannot find module/)
    expect(result.output).toMatch(/variant/)
    expect(result.code).not.toBe(0)
  })

  it('control: the same fence without the prop typechecks, so the planted prop is what reds', async () => {
    const result = await compile(
      'feedback-readme-examples-plain',
      files(navigationWith('')),
      'current',
    )
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  })

  it('control: a size on NavigationMenu.Trigger fails to typecheck too, since it takes neither prop', async () => {
    const result = await compile(
      'feedback-readme-examples-size',
      files(navigationWith(' size="sm"')),
      'current',
    )
    expect(result.output).not.toMatch(/Cannot find module/)
    expect(result.output).toMatch(/size/)
    expect(result.code).not.toBe(0)
  })
})
