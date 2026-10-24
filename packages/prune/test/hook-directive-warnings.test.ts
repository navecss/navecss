/**
 * The `@nave` lines that are not problems: an unknown atom under `onUnknown: 'warn'` and every
 * order warning. The plugin records them; `next build` prints them from the hook, as warnings that
 * stop nothing and are not counted, and the development server prints them from the plugin.
 */
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { writeBuildCss } from './helpers/build-output.ts'
import { listen, NOTHING, runCheck } from './helpers/hook-run.ts'
import {
  capturePrinted,
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'

registerIsolation()

const BUILD = 'phase-production-build'
const DEV = 'phase-development-server'

/**
 * An unknown atom on line 3, column 3.
 */
const UNKNOWN: Sheet = {
  css: '/* styles */\n.card {\n  @nave interactve;\n}\n',
  file: 'app/globals.css',
}

/**
 * `display: flex` on line 3, column 3 overrides the block of `hideDesktopUp`.
 */
const ORDER: Sheet = {
  css: '.card {\n  @nave hideDesktopUp;\n  display: flex;\n}\n',
  file: 'app/order.css',
}

/**
 * Runs the plugin over the sheets and the atom layer in the phase, and writes the CSS it left as
 * the build's output.
 */
async function built(
  project: Project,
  sheets: readonly Sheet[],
  options: NaveOptions,
  phase: string = BUILD,
): Promise<void> {
  const results = await runSheets(project, [...sheets, ATOMIC_SHEET], { options, phase })
  writeBuildCss(project, results.at(-1)!.css)
}

describe('AC-nextjs-used-atoms-03: the hook prints an unknown atom under onUnknown "warn" as a warning', () => {
  it('prints the line placed in its stylesheet, passes the build and prints no error', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const options: NaveOptions = { onUnknown: 'warn' }
    listen()
    await built(project, [UNKNOWN], options)

    const printed = await runCheck(project, options)

    expect(printed.error).toBeUndefined()
    expect(printed.errors).toEqual([])
    expect(printed.warnings).toHaveLength(1)
    expect(printed.warnings[0]).toMatch(/^app\/globals\.css:3:3: .*unknown atom "interactve"/u)
  })

  it('does not count it: the report and the throw count the other problem only', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const options: NaveOptions = { onUnknown: 'warn' }
    listen()
    await built(project, [UNKNOWN], options)

    const printed = await runCheck(project, options)

    expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect(printed.errors).toHaveLength(1)
    expect(printed.errors[0]).toMatch(/^1 problem in 1 file: /u)
    expect(printed.warnings.join('\n')).toContain('unknown atom "interactve"')
  })

  it('prints nothing about it under "ignore"', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const options: NaveOptions = { onUnknown: 'ignore' }
    listen()
    await built(project, [UNKNOWN], options)

    expect(await runCheck(project, options)).toEqual(NOTHING)
  })

  it('prints no warning for a record that is older than the code, only the message that stops the build', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const options: NaveOptions = { onUnknown: 'warn' }
    listen()
    await built(project, [UNKNOWN], options)
    appendFileSync(path.join(project.dir, 'app/page.tsx'), '\n// changed\n')

    const printed = await runCheck(project, options)

    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.warnings).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-03: the hook prints an order warning, whatever onUnknown says', () => {
  it.each(['error', 'warn', 'ignore'] as const)(
    'under onUnknown %j it prints the warning once, placed, and passes the build',
    async (onUnknown) => {
      const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
      const options: NaveOptions = { onUnknown }
      listen()
      await built(project, [ORDER], options)

      const printed = await runCheck(project, options)

      expect(printed.error).toBeUndefined()
      expect(printed.errors).toEqual([])
      expect(printed.warnings).toHaveLength(1)
      expect(printed.warnings[0]).toMatch(
        /^app\/order\.css:3:3: @nave: display: flex comes after "hideDesktopUp"/u,
      )
    },
  )
})

describe('AC-nextjs-used-atoms-03: the hook prints the warnings of several stylesheets in path order', () => {
  it('prints the order warnings of six stylesheets sorted by stylesheet path', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const names = ['m', 'c', 'x', 'a', 'q', 'f']
    const sheets: Sheet[] = names.map((name) => ({ css: ORDER.css, file: `app/${name}.css` }))
    listen()
    await built(project, sheets, {})

    const printed = await runCheck(project, {})

    expect(printed.error).toBeUndefined()
    const files = printed.warnings.map((line) => /^(app\/[a-z]\.css):/u.exec(line)?.[1])
    expect(files).toEqual(
      names.toSorted((a, b) => a.localeCompare(b)).map((name) => `app/${name}.css`),
    )
  })
})

describe('AC-nextjs-used-atoms-03: the plugin prints these lines in the development server only', () => {
  it('prints nothing about them in a build, where the hook prints them', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = capturePrinted()

    await built(project, [UNKNOWN, ORDER], { onUnknown: 'warn' }, BUILD)

    expect(printed().filter((line) => line.includes('interactve'))).toEqual([])
    expect(printed().filter((line) => line.includes('comes after'))).toEqual([])
  })

  it('prints each once in the development server', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = capturePrinted()

    await built(project, [UNKNOWN, ORDER], { onUnknown: 'warn' }, DEV)

    expect(printed().filter((line) => line.includes('interactve'))).toHaveLength(1)
    expect(printed().filter((line) => line.includes('comes after'))).toHaveLength(1)
  })
})
