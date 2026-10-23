/**
 * AC-native-apply-order-43, Tier A: the three-engine rows run from their own Vitest browser
 * config, which names Chromium, Firefox and WebKit, while each existing browser config (core's and
 * base-ui's) still names exactly one instance, Chromium, and does not run those rows. CI installs
 * the two extra engines beside Chromium and runs the engines config through `test:browser`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import baseUiConfig from '../../base-ui/vitest.browser.config.ts'
import coreConfig from '../vitest.browser.config.ts'
import enginesConfig from '../vitest.browser.engines.config.ts'

const REPO = path.resolve(import.meta.dirname, '../../..')

interface BrowserSection {
  readonly browser?: { readonly instances?: readonly { readonly browser: string }[] }
}

/**
 * The browsers each browser section of a Vitest config names, in order: one list for a config of
 * its own, one per project for a config that has projects.
 */
function instanceListsOf(config: unknown): string[][] {
  const { test } = config as {
    test?: BrowserSection & { projects?: readonly { test?: BrowserSection }[] }
  }
  const sections = test?.projects?.map((project) => project.test) ?? [test]
  return sections.map((section) => (section?.browser?.instances ?? []).map((i) => i.browser))
}

/**
 * The files a Vitest config runs.
 */
function filesOf(config: unknown): { include: string[] } {
  const test = (config as { test?: { include?: string[] } }).test
  return { include: test?.include ?? [] }
}

describe('AC-native-apply-order-43 - the browser configs', () => {
  it('the engines config names chromium, firefox and webkit', () => {
    expect(instanceListsOf(enginesConfig)).toEqual([['chromium', 'firefox', 'webkit']])
  })

  it('core’s existing browser config names exactly one instance, chromium', () => {
    expect(instanceListsOf(coreConfig)).toEqual([['chromium']])
  })

  it('base-ui’s existing browser config names exactly one instance, chromium, in every project', () => {
    const lists = instanceListsOf(baseUiConfig)

    expect(lists.length).toBeGreaterThan(1)
    expect(lists.every((list) => list.length === 1 && list[0] === 'chromium')).toBe(true)
  })

  it('the engines config runs the engines test, which core’s config does not pick up', () => {
    const engines = filesOf(enginesConfig)
    const core = filesOf(coreConfig)

    expect(engines.include).toEqual(['test/browser/engines/**/*.engines.test.ts'])
    expect(core.include).toEqual(['test/browser/**/*.browser.test.ts'])
  })

  it('CI installs firefox and webkit beside chromium', () => {
    const workflow = readFileSync(path.join(REPO, '.github/workflows/code-quality.yml'), 'utf8')

    expect(workflow).toMatch(/playwright install --with-deps chromium firefox webkit/)
  })

  it('test:browser runs the engines config', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, 'packages/core/package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>
    }

    expect(manifest.scripts['test:browser']).toContain('test:browser:engines')
    expect(manifest.scripts['test:browser:engines']).toContain(
      '--config vitest.browser.engines.config.ts',
    )
  })
})
