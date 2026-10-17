import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { Builder, Bundler } from '../scripts/server-components/app.ts'

import { check, writeApp } from '../scripts/server-components/app.ts'
import { ROUTES } from '../scripts/server-components/read.ts'

const PRIMARY = '<button type="button" data-nave-variant="primary">Open</button>'
const ACCORDION = '<div class="nave-base-ui-accordion-root"></div>'
const VERSIONS = { next: '16.4.2', react: '19.3.1' }

const made: string[] = []

afterAll(() => {
  for (const directory of made) {
    rmSync(directory, { force: true, recursive: true })
  }
})

// An app directory holding the installed package's namespace module, as the check finds it.
const newApp = (): string => {
  const app = mkdtempSync(path.join(tmpdir(), 'nave-server-components-test-'))
  made.push(app)
  const entry = path.join(app, 'node_modules/@navecss/base-ui/dist/dialog')
  mkdirSync(entry, { recursive: true })
  writeFileSync(path.join(entry, 'index.js'), 'export * as Dialog from "./parts.generated.js";\n')
  return app
}

const entryOf = (app: string): string =>
  readFileSync(path.join(app, 'node_modules/@navecss/base-ui/dist/dialog/index.js'), 'utf8')

// A build puts the pages it prerendered where Next.js does.
const prerender = (app: string, html: string): void => {
  const directory = path.join(app, '.next/server/app')
  mkdirSync(directory, { recursive: true })
  for (const route of ROUTES) {
    writeFileSync(path.join(directory, `${route.name}.html`), html)
  }
}

const isControl = (app: string): boolean => entryOf(app).startsWith("'use client'")

// The builder of a package that works: the two builds pass, and the control, run once the
// directive is on dialog/index.js, fails.
const working: Builder = (app, bundler) => {
  if (isControl(app)) {
    return { bundler, exit: 1, log: 'Build failed' }
  }
  prerender(app, PRIMARY + ACCORDION)
  return { bundler, exit: 0, log: 'Compiled' }
}

const failing: Builder = (_app, bundler) => ({
  bundler,
  exit: bundler === 'webpack' ? 1 : 0,
  log: bundler === 'webpack' ? 'Cannot access Dialog.Root on the server' : 'Compiled',
})

const neverFails: Builder = (app, bundler) => {
  prerender(app, PRIMARY + ACCORDION)
  return { bundler, exit: 0, log: 'Compiled' }
}

const bare: Builder = (app, bundler) => {
  if (!isControl(app)) {
    prerender(app, '<p>empty</p>')
  }
  return { bundler, exit: isControl(app) ? 1 : 0, log: '' }
}

const run = (app: string, builder: Builder): { lines: string[]; problems: string[] } => {
  const lines: string[] = []
  const problems = check(app, builder, (line) => {
    lines.push(line)
  })
  return { lines, problems }
}

describe('AC-base-ui-bridge-53: the release-time check writes its app and judges its builds', () => {
  it('writes the manifest with the packed package and the versions, a layout and a page per route', () => {
    const app = newApp()
    writeApp(app, VERSIONS, '/tmp/package.tgz')
    const manifest = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies).toMatchObject({
      '@navecss/base-ui': 'file:/tmp/package.tgz',
      next: '16.4.2',
      react: '19.3.1',
      'react-dom': '19.3.1',
    })
    expect(readFileSync(path.join(app, 'app/layout.jsx'), 'utf8')).toContain('<html lang="en">')
    for (const route of ROUTES) {
      expect(readFileSync(path.join(app, 'app', route.name, 'page.jsx'), 'utf8')).toBe(route.source)
    }
  })

  it('finds nothing wrong with a package whose builds pass and whose control fails, under both bundlers', () => {
    const { lines, problems } = run(newApp(), working)
    expect(problems).toEqual([])
    expect(lines).toEqual([
      'turbopack: next build exit 0',
      'webpack: next build exit 0',
      'control, turbopack: next build exit 1 (non-zero expected)',
      'control, webpack: next build exit 1 (non-zero expected)',
    ])
  })

  it('puts the directive on dialog/index.js for the control', () => {
    const app = newApp()
    run(app, working)
    expect(entryOf(app).startsWith("'use client';\nexport * as Dialog")).toBe(true)
  })

  it('control: a build that exits non-zero, prints a known error or prerenders nothing is reported', () => {
    const { problems } = run(newApp(), failing)
    expect(problems).toContain('webpack: next build exited 1')
    expect(problems).toContain('webpack: the log contains "Cannot access"')
    expect(problems).toContain('turbopack: namespace was not prerendered')
  })

  it('control: a control build that passes is reported, so a check that cannot fail cannot pass', () => {
    const bundlers: Bundler[] = ['turbopack', 'webpack']
    expect(run(newApp(), neverFails).problems).toEqual(
      bundlers.map(
        (bundler) => `control, ${bundler}: the build passed with the directive on dialog/index.js`,
      ),
    )
  })

  it('control: a page without the primary button is reported against its bundler', () => {
    expect(run(newApp(), bare).problems).toContain(
      'turbopack: single: no <button> with data-nave-variant="primary"',
    )
  })
})
