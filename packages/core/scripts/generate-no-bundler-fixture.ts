/**
 * Builds, from the root README's own "Without a bundler" fences, the directory the no-bundler
 * browser test serves: GITIGNORED and regenerated before every `test:browser` run (never
 * committed, same treatment as `dist/` and the other generated fixtures beside it).
 *
 * Node-only, deliberately: a browser test cannot run a command. The directory is the README's
 * `index.html` and `src/app.css` (with the consumer rule the criterion names appended), plus a
 * `node_modules/@navecss/core` that is this package as it is built, which is what a project
 * that ran `pnpm add @navecss/core` has. The README's own `build` script then runs, through a
 * `navecss-core` shim on PATH, and writes `app.css`. A README whose commands do not run fails
 * this script, so a stale fence cannot leave the browser test serving a page nobody documents.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractFences } from '../test/doc-fences.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '..')
const FIXTURE = path.join(CORE_ROOT, 'test/browser/fixtures/no-bundler')

const CONSUMER_RULE = `
@layer components.consumer {
  .btn {
    @nave interactive focusRing;
    background: var(--nave-color-action-primary);
  }
}
`

/**
 * The text from the README's `### Without a bundler` heading to the next heading of the same or a
 * shallower level.
 */
function noBundlerSection(readme: string): string {
  const start = readme.indexOf('\n### Without a bundler\n')
  if (start === -1) throw new Error('the README has no "Without a bundler" section')
  const rest = readme.slice(start + 1)
  const next = /\n#{1,3} /.exec(rest.slice(1))
  return next ? rest.slice(0, next.index + 1) : rest
}

/**
 * The body of the first fence of language `lang`.
 */
function fenceOf(fences: ReturnType<typeof extractFences>, lang: string): string {
  const fence = fences.find((candidate) => candidate.lang === lang)
  if (!fence) throw new Error(`the no-bundler section has no ${lang} fence`)
  return fence.body
}

rmSync(FIXTURE, { force: true, recursive: true })
mkdirSync(path.join(FIXTURE, 'src'), { recursive: true })

const readme = readFileSync(path.resolve(CORE_ROOT, '../../README.md'), 'utf8')
const fences = extractFences('README.md', noBundlerSection(readme))
writeFileSync(path.join(FIXTURE, 'index.html'), fenceOf(fences, 'html'))
writeFileSync(path.join(FIXTURE, 'src/app.css'), `${fenceOf(fences, 'css')}${CONSUMER_RULE}`)

// What `pnpm add @navecss/core` leaves: the package under node_modules (a copy of what it
// publishes, never a link back to this directory, which would hold the fixture inside itself) with
// its one dependency beside it, and its bin on PATH.
const installed = path.join(FIXTURE, 'node_modules/@navecss')
mkdirSync(path.join(installed, 'core'), { recursive: true })
cpSync(path.join(CORE_ROOT, 'dist'), path.join(installed, 'core/dist'), { recursive: true })
copyFileSync(path.join(CORE_ROOT, 'package.json'), path.join(installed, 'core/package.json'))
symlinkSync(path.resolve(CORE_ROOT, '../tokens'), path.join(installed, 'tokens'))
mkdirSync(path.join(FIXTURE, 'node_modules/.bin'), { recursive: true })
const shim = path.join(FIXTURE, 'node_modules/.bin/navecss-core')
writeFileSync(shim, '#!/bin/sh\nexec node "$(dirname "$0")/../@navecss/core/dist/bin.js" "$@"\n')
chmodSync(shim, 0o755)

// A page that links only the self-contained stylesheet, for the criterion that names it.
writeFileSync(
  path.join(FIXTURE, 'standalone-only.html'),
  [
    '<!doctype html>',
    '<meta charset="utf-8" />',
    '<link rel="stylesheet" href="node_modules/@navecss/core/dist/standalone.css" />',
    '<div class="nave-flex"><span>one</span><span>two</span></div>',
    '<button class="nave-focus-ring">focus me</button>',
    '',
  ].join('\n'),
)

const manifest = JSON.parse(fenceOf(fences, 'json')) as { scripts?: Record<string, string> }
const build = manifest.scripts?.build
if (build === undefined) throw new Error('the README package.json fence has no "build" script')
// The README's script is one `navecss-core expand ...` command: run the shim directly, with no
// shell, so a script that is anything else fails here instead of running something unreviewed.
const [command, ...flags] = build.trim().split(/\s+/)
if (command !== 'navecss-core')
  throw new Error(`the "build" script must run navecss-core: ${build}`)
execFileSync(shim, flags, { cwd: FIXTURE, stdio: 'inherit' })
const built = readFileSync(path.join(FIXTURE, 'app.css'), 'utf8')
if (built.includes('@nave')) throw new Error('the README build left a directive in app.css')

console.log('✓ Generated the no-bundler fixture in test/browser/fixtures/no-bundler/')
