import { describe, expect, it } from 'vitest'

import { fencesOf, readReadme } from './support/readme.ts'
import { compile } from './support/type-fixtures.ts'

const MINUTES = 180_000

const examples = fencesOf(readReadme()).filter(({ language }) => ['ts', 'tsx'].includes(language))

const files = (list: readonly { body: string; language: string }[]): Record<string, string> =>
  Object.fromEntries(
    list.map(({ body, language }, index) => [`example-${index}.${language}`, body]),
  )

describe('AC-base-ui-overlay-completion-42: the README examples typecheck against the built package (extends AC-base-ui-bridge-48)', () => {
  it('has examples, and every TSX example is a component the render test can mount', () => {
    expect(examples.length).toBeGreaterThan(0)
    const components = examples.filter(({ language }) => language === 'tsx')
    expect(components.length).toBeGreaterThan(0)
    for (const { body } of components) {
      expect(body).toMatch(/export default function \w+\(/)
    }
  })

  it(
    'compiles every example, with no error, at the current Base UI',
    { timeout: MINUTES },
    async () => {
      const result = await compile('readme-examples', files(examples), 'current')
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )

  it(
    'has an example importing from Base UI and one from this package, and both compile',
    { timeout: MINUTES },
    async () => {
      const before = examples.filter(({ body }) => body.includes("from '@base-ui/react/"))
      const after = examples.filter(({ body }) => body.includes("from '@navecss/base-ui/"))
      expect(before.length).toBeGreaterThan(0)
      expect(after.length).toBeGreaterThan(0)
      const result = await compile('readme-examples-swap', files([...before, ...after]), 'current')
      expect(result.code).toBe(0)
    },
  )

  it(
    'has a Menubar example that imports Menu from @navecss/base-ui/menu and compiles',
    { timeout: MINUTES },
    async () => {
      const menubars = examples.filter(({ body }) => /<Menubar[\s>]/.test(body))
      expect(menubars.length).toBeGreaterThan(0)
      for (const { body } of menubars) {
        expect(body).toMatch(/import \{[^}]*\bMenu\b[^}]*\} from '@navecss\/base-ui\/menu'/)
        expect(body).not.toMatch(/from '@base-ui\/react\/menu'/)
        expect(body).toMatch(/<Menu\.Trigger variant="ghost"/)
      }
      const result = await compile('readme-examples-menubar', files(menubars), 'current')
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )

  it(
    'has exactly one Combobox example, from @navecss/base-ui/combobox, and it compiles',
    { timeout: MINUTES },
    async () => {
      const comboboxes = examples.filter(({ body }) => /<Combobox\.Root[\s>]/.test(body))
      expect(comboboxes).toHaveLength(1)
      expect(comboboxes[0]?.body).toMatch(/from '@navecss\/base-ui\/combobox'/)
      expect(comboboxes[0]?.body).toMatch(/<Combobox\.InputGroup[\s>]/)
      const result = await compile('readme-examples-combobox', files(comboboxes), 'current')
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )

  it(
    'control: a Menubar example whose Menu comes from the wrong place reds the compile',
    { timeout: MINUTES },
    async () => {
      const planted = {
        body: 'import { Menubar } from \'@navecss/base-ui/menubar\'\nexport default function Planted() {\n  return <Menubar><Menu.Trigger variant="ghost">File</Menu.Trigger></Menubar>\n}',
        language: 'tsx',
      }
      const result = await compile('readme-examples-menubar-planted', files([planted]), 'current')
      expect(result.code).not.toBe(0)
      expect(result.output).toMatch(/Cannot find name 'Menu'/)
    },
  )

  it('control: an example with a type error reds the compile', { timeout: MINUTES }, async () => {
    const planted = {
      body: 'import { Button } from \'@navecss/base-ui/button\'\nexport default function Planted() {\n  return <Button size="lg">Save</Button>\n}',
      language: 'tsx',
    }
    const result = await compile('readme-examples-planted', files([planted]), 'current')
    expect(result.code).not.toBe(0)
    expect(result.output).toMatch(/not assignable/)
  })
})
