import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { Outcome, Runner, Setup } from '../scripts/server-components/run.ts'

import { ROUTES } from '../scripts/server-components/read.ts'
import { npmOf, runCheck } from '../scripts/server-components/run.ts'

const made: string[] = []

afterAll(() => {
  for (const directory of made) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const ok = (stdout = ''): Outcome => ({ status: 0, stderr: '', stdout })

// A Node install with npm beside it, and a package with a build.
const newPrefix = (): { node: string; packageDir: string } => {
  const prefix = mkdtempSync(path.join(tmpdir(), 'nave-server-components-run-'))
  made.push(prefix)
  const node = path.join(prefix, 'bin/node')
  mkdirSync(path.dirname(npmOf(node)), { recursive: true })
  writeFileSync(npmOf(node), '')
  const packageDir = path.join(prefix, 'package')
  mkdirSync(path.join(packageDir, 'dist'), { recursive: true })
  writeFileSync(path.join(packageDir, 'dist/index.js'), '')
  return { node, packageDir }
}

interface Written {
  readonly complaints: string[]
  readonly said: string[]
}

const setupOf = (runner: Runner, overrides: Partial<Setup> = {}): Setup & Written => {
  const written: Written = { complaints: [], said: [] }
  return {
    ...newPrefix(),
    complain: (line) => {
      written.complaints.push(line)
    },
    keep: false,
    runner,
    say: (line) => {
      written.said.push(line)
    },
    versions: { next: '16.4.2', react: '19.3.1' },
    ...overrides,
    ...written,
  }
}

// What the programs do for a package that works: pack writes a tarball, install puts the
// package and Next.js in the app, and each build prerenders the pages, or fails once the
// directive is on dialog/index.js.
const worksRunner =
  (outcomeOfBuild: (app: string, flags: readonly string[]) => Outcome): Runner =>
  (_command, args, cwd) => {
    if (args.includes('pack')) {
      const destination = args.at(-1) ?? ''
      writeFileSync(path.join(destination, 'pkg-1.tgz'), '')
      return ok('pkg-1.tgz\n')
    }
    if (args.includes('install')) {
      const dist = path.join(cwd, 'node_modules/@navecss/base-ui/dist/dialog')
      mkdirSync(dist, { recursive: true })
      writeFileSync(
        path.join(dist, 'index.js'),
        'export * as Dialog from "./parts.generated.js";\n',
      )
      mkdirSync(path.join(cwd, 'node_modules/next'), { recursive: true })
      writeFileSync(path.join(cwd, 'node_modules/next/package.json'), '{"version":"16.4.2"}')
      return ok()
    }
    return outcomeOfBuild(cwd, args)
  }

const readIndex = (app: string): string =>
  readFileSync(path.join(app, 'node_modules/@navecss/base-ui/dist/dialog/index.js'), 'utf8')

const PAGE =
  '<button data-nave-variant="primary">Open</button><i class="nave-base-ui-accordion-root">'

const passing = worksRunner((app) => {
  const isControl = readIndex(app).startsWith("'use client'")
  if (isControl) {
    return { status: 1, stderr: 'Build failed', stdout: '' }
  }
  const directory = path.join(app, '.next/server/app')
  mkdirSync(directory, { recursive: true })
  for (const route of ROUTES) {
    writeFileSync(path.join(directory, `${route.name}.html`), PAGE)
  }
  return ok('Compiled')
})

describe('AC-base-ui-bridge-53: the release-time check runs its processes and returns its verdict', () => {
  it('finds the npm script beside the running Node', () => {
    expect(npmOf('/opt/node/bin/node')).toBe('/opt/node/lib/node_modules/npm/bin/npm-cli.js')
  })

  it('returns 0 for a package whose builds pass and whose control fails, and says the Next.js version', () => {
    const setup = setupOf(passing)
    expect(runCheck(setup)).toBe(0)
    expect(setup.said[0]).toBe('Next.js 16.4.2')
    expect(setup.complaints).toEqual([])
  })

  it('returns 1 when a build fails, naming what is wrong', () => {
    const setup = setupOf(worksRunner(() => ({ status: 1, stderr: 'Cannot access', stdout: '' })))
    expect(runCheck(setup)).toBe(1)
    expect(setup.complaints).toContain('turbopack: next build exited 1')
  })

  it('returns 2 when there is no build of the package, or no npm beside Node', () => {
    const noDist = setupOf(passing)
    rmSync(path.join(noDist.packageDir, 'dist'), { force: true, recursive: true })
    expect(runCheck(noDist)).toBe(2)
    expect(noDist.complaints[0]).toContain('dist/ is missing')
    const noNpm = setupOf(passing)
    rmSync(npmOf(noNpm.node), { force: true })
    expect(runCheck(noNpm)).toBe(2)
    expect(noNpm.complaints[0]).toContain('npm was not found')
  })

  it('returns 2 when npm cannot pack or cannot install', () => {
    const noPack = setupOf(() => ({ status: 1, stderr: 'E404', stdout: '' }))
    expect(runCheck(noPack)).toBe(2)
    expect(noPack.complaints[0]).toContain('npm pack failed')
    const noInstall = setupOf((command, args, cwd) =>
      args.includes('install')
        ? { status: 1, stderr: 'ENOTFOUND', stdout: '' }
        : passing(command, args, cwd),
    )
    expect(runCheck(noInstall)).toBe(2)
    expect(noInstall.complaints[0]).toContain('npm install failed')
  })

  it('says where the app is kept when asked to keep it', () => {
    const setup = setupOf(passing, { keep: true })
    expect(runCheck(setup)).toBe(0)
    const kept = setup.said.find((line) => line.startsWith('kept: ')) ?? ''
    expect(kept).not.toBe('')
    made.push(kept.slice('kept: '.length))
  })
})
