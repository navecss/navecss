import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type ComponentType, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, render } from '../support/react.ts'
import { fencesOf, readReadme } from '../support/readme.ts'
import { PACKAGE_DIR } from '../support/stylesheet.ts'
import { tableP } from '../support/table-p.ts'

afterEach(cleanup)

// One directory per run: the runs are separate workers and write the same examples at once.
const DIRECTORY = path.join(
  PACKAGE_DIR,
  'test/fixtures/readme-examples',
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
  `${process.env.NAVE_BASE_UI}-react-${process.env.NAVE_REACT}`,
)

const components = fencesOf(readReadme()).filter(({ language }) => language === 'tsx')

/**
 * The example as the README writes it, with the package's own import specifiers pointed at its
 * source: the render runs alias React and Base UI for Vite-transformed code only, and the sources
 * are the modules the built package is made of.
 */
const toSource = (body: string): string =>
  body.replaceAll(/'@navecss\/base-ui\/([\w-]+)'/g, "'../../../../src/$1/index.ts'")

const load = async (name: string, body: string): Promise<ComponentType> => {
  mkdirSync(DIRECTORY, { recursive: true })
  const file = path.join(DIRECTORY, `${name}.tsx`)
  writeFileSync(file, toSource(body))
  const module = (await import(/* @vite-ignore */ file)) as { default: ComponentType }
  return module.default
}

const PART_TAG = /<([A-Z]\w*(?:\.[A-Z]\w*)?)[\s/>]/g

/**
Every styled part the example writes as a tag, with the classes its row names.
 */
const styledTags = (body: string): [string, readonly string[]][] =>
  [...new Set(body.matchAll(PART_TAG).map((match) => match[1] ?? ''))]
    .filter((tag) => tableP.has(tag))
    .map((tag) => [tag, tableP.get(tag) ?? []])

const missingClasses = (body: string, root: ParentNode): string[] =>
  styledTags(body).flatMap(([tag, classes]) =>
    classes
      .filter((name) => root.querySelector(`.${name}`) === null)
      .map((name) => `${tag} -> ${name}`),
  )

describe('AC-base-ui-bridge-48: the README examples render, and each styled part has its class', () => {
  it('has TSX examples', () => {
    expect(components.length).toBeGreaterThan(0)
  })

  it.each(components.map(({ body }, index) => ({ body, index })))(
    'renders example $index without error, every part it writes that renders carrying its class',
    async ({ body, index }) => {
      const Example = await load(`example-${index}`, body)
      await render(createElement(Example))
      const rendered = styledTags(body).filter(([, classes]) =>
        classes.some((name) => document.body.querySelector(`.${name}`) !== null),
      )
      expect(rendered.length).toBeGreaterThan(0)
      // A part a closed popup holds is not mounted, so a part counts once something of its row is.
      const unmatched = rendered.flatMap(([tag, classes]) =>
        classes
          .filter((name) => document.body.querySelector(`.${name}`) === null)
          .map((name) => `${tag} -> ${name}`),
      )
      expect(unmatched).toEqual([])
    },
  )

  it('control: a part rendered without the wrapper is reported', async () => {
    const body =
      "import { Button } from '@base-ui/react/button'\nexport default function Bare() {\n  return <Button>Save</Button>\n}"
    const Example = await load('planted', body)
    await render(createElement(Example))
    expect(missingClasses(body, document.body)).toEqual(['Button -> nave-base-ui-button'])
  })
})
