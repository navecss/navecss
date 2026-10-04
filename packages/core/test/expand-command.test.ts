/**
 * AC-directive-core-42 and AC-directive-core-43 (and AC-14, AC-16, AC-26's clauses for the
 * command): `navecss-core expand`, the shipped bin run as a consumer's `package.json` script
 * would run it, over files in a scratch project.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'
import { expandText } from '../src/directive/expand-text.ts'
import { navePlugin as lightningAdapter } from '../src/lightningcss.ts'
import { navePlugin as postcssPlugin } from '../src/postcss.ts'
import { runHook } from './helpers/vite-hook.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '..', 'dist', 'bin.js')

const STANDALONE_PATH = 'node_modules/@navecss/core/dist/standalone.css'
const STANDALONE_CDN = 'https://cdn.jsdelivr.net/npm/@navecss/core@<version>/dist/standalone.css'
const NO_TOKENS_PATH = 'node_modules/@navecss/core/dist/no-tokens.css'
const NO_TOKENS_CDN = 'https://cdn.jsdelivr.net/npm/@navecss/core@<version>/dist/no-tokens.css'

const project = { dir: '' }

beforeEach(() => {
  project.dir = mkdtempSync(path.join(tmpdir(), 'nave-expand-'))
})

afterEach(() => {
  rmSync(project.dir, { force: true, recursive: true })
})

function write(name: string, text: string): string {
  const file = path.join(project.dir, name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return file
}

function read(name: string): string {
  return readFileSync(path.join(project.dir, name), 'utf8')
}

interface Run {
  readonly all: string
  readonly status: number | null
  readonly stderr: string
  readonly stdout: string
}

function expand(...args: string[]): Run {
  const result = spawnSync(process.execPath, [BIN, 'expand', ...args], {
    cwd: project.dir,
    encoding: 'utf8',
    timeout: 15_000,
  })
  return {
    all: result.stdout + result.stderr,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  }
}

/** Every file under the project, as relative paths: the "writes exactly its --out files" check. */
function tree(): string[] {
  return readdirSync(project.dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(project.dir, path.join(entry.parentPath, entry.name)))
    .map((relative) => relative.split(path.sep).join('/'))
    .toSorted()
}

const IS_ROOT = process.getuid?.() === 0

describe('AC-directive-core-42 — navecss-core expand', () => {
  it('writes expandText()’s output to --out and exits 0', () => {
    const source = '.btn {\n  color: red;\n  @nave interactive focusRing;\n}\n'
    write('src/app.css', source)

    const run = expand('--source=src/app.css', '--out=public/app.css')

    expect(run.status, run.all).toBe(0)
    expect(read('public/app.css')).toBe(expandText(source, { onUnknown: 'error' }).css)
    expect(read('public/app.css')).not.toContain('@nave')
  })

  it('writes exactly its --out files: nothing else appears, and the source is untouched', () => {
    const source = '.btn { @nave flex; }\n'
    write('src/app.css', source)
    write('src/b.css', '.b { @nave block; }\n')

    const run = expand(
      '--source=src/app.css',
      '--out=a.css',
      '--source=src/b.css',
      '--out=out/b.css',
    )

    expect(run.status, run.all).toBe(0)
    expect(tree()).toEqual(['a.css', 'out/b.css', 'src/app.css', 'src/b.css'])
    expect(read('src/app.css')).toBe(source)
  })

  it('AC-directive-core-26: adds no @import and no url() of its own, over every atom', () => {
    write('src/app.css', `.btn { @nave ${Object.keys(atoms).join(' ')}; }\n`)

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status, run.all).toBe(0)
    expect(read('app.css')).not.toMatch(/@import|url\(/i)
  })

  it('with two files each holding one unknown atom, one run prints both, each with its own file and position, and exits 1', () => {
    write('src/a.css', '.a {\n  @nave nope;\n}\n')
    write('src/b.css', '.b { color: red; }\n\n.c { @nave alsoNope; }\n')

    const run = expand(
      '--source=src/a.css',
      '--out=out/a.css',
      '--source=src/b.css',
      '--out=out/b.css',
    )

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('src/a.css:2:9: @nave: unknown atom "nope"')
    expect(run.stderr).toContain('src/b.css:3:12: @nave: unknown atom "alsoNope"')
    expect(existsSync(path.join(project.dir, 'out'))).toBe(false)
  })

  it('on exit 1 --out is not written, even for a file with no problem', () => {
    write('src/ok.css', '.a { @nave flex; }\n')
    write('src/bad.css', '.b { @nave nope; }\n')

    const run = expand(
      '--source=src/ok.css',
      '--out=ok.out.css',
      '--source=src/bad.css',
      '--out=bad.out.css',
    )

    expect(run.status).toBe(1)
    expect(existsSync(path.join(project.dir, 'ok.out.css'))).toBe(false)
    expect(existsSync(path.join(project.dir, 'bad.out.css'))).toBe(false)
  })

  it('prints the core’s own bodies unchanged, with the host’s file:line:column frame (AC-14)', () => {
    write('src/a.css', '.x { @nave interactve; }\n')

    const run = expand('--source=src/a.css', '--out=a.css')

    expect(run.stderr).toContain(
      'src/a.css:1:12: @nave: unknown atom "interactve". Did you mean "interactive"?',
    )
  })

  it('reports every problem of one stylesheet as one report, and two stylesheets as two (AC-16)', () => {
    write('src/a.css', '.root {\n  @nave flx interactve;\n}\n.icon {\n  @nave srOnlyy;\n}\n')
    write('src/b.css', '.z { @nave nope; }\n')

    const run = expand('--source=src/a.css', '--out=a.css', '--source=src/b.css', '--out=b.css')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      'src/a.css:2:9: @nave: unknown atom "flx". Did you mean "flex"?\n2 more in this stylesheet:\n2:13: unknown atom "interactve". Did you mean "interactive"?\n5:9: unknown atom "srOnlyy". Did you mean "srOnly"?',
    )
    expect(run.stderr).toContain('src/b.css:1:12: @nave: unknown atom "nope"')
  })

  it.skipIf(IS_ROOT)(
    'an @import of a local file stays byte for byte, and the file is not read',
    () => {
      write('src/app.css', "@import './local.css';\n.btn { @nave flex; }\n")
      const local = write('src/local.css', '.local { color: red; }\n')
      chmodSync(local, 0o000)

      try {
        const run = expand('--source=src/app.css', '--out=app.css')

        expect(run.status, run.all).toBe(0)
        expect(read('app.css').startsWith("@import './local.css';\n")).toBe(true)
      } finally {
        chmodSync(local, 0o644)
      }
    },
  )

  it('a missing --out exits 2', () => {
    write('src/app.css', '.a { @nave flex; }\n')

    const run = expand('--source=src/app.css')

    expect(run.status).toBe(2)
    expect(run.stderr).toMatch(/--out/)
  })

  it('a missing --source exits 2', () => {
    expect(expand('--out=app.css').status).toBe(2)
    expect(expand().status).toBe(2)
  })

  it('unequal --source and --out counts exit 2 and write nothing', () => {
    write('src/a.css', '.a { @nave flex; }\n')
    write('src/b.css', '.b { @nave flex; }\n')

    const run = expand('--source=src/a.css', '--source=src/b.css', '--out=only.css')

    expect(run.status).toBe(2)
    expect(existsSync(path.join(project.dir, 'only.css'))).toBe(false)
  })

  it('an unreadable --source exits 2, naming the path', () => {
    const run = expand('--source=src/missing.css', '--out=app.css')

    expect(run.status).toBe(2)
    expect(run.stderr).toContain('src/missing.css')
    expect(existsSync(path.join(project.dir, 'app.css'))).toBe(false)
  })

  it('an --out that is its own --source exits 2 and leaves the source as it was', () => {
    const source = '.a { @nave flex; }\n'
    write('src/app.css', source)

    const run = expand('--source=src/app.css', '--out=src/app.css')

    expect(run.status).toBe(2)
    expect(read('src/app.css')).toBe(source)
  })

  it('an unknown flag exits 2 with usage', () => {
    write('src/app.css', '.a { @nave flex; }\n')

    const run = expand('--source=src/app.css', '--out=app.css', '--onUnknown=warn')

    expect(run.status).toBe(2)
    expect(run.stderr).toMatch(/Usage/)
  })

  it('--extend=<module> adds the consumer’s own atoms, read from a path the way the PostCSS plugin reads one', () => {
    write(
      'my-atoms.mjs',
      "export default { brand: { declarations: { color: 'rebeccapurple' } } }\n",
    )
    write('src/app.css', '.a { @nave brand; }\n')

    const run = expand('--source=src/app.css', '--out=app.css', '--extend=my-atoms.mjs')

    expect(run.status, run.all).toBe(0)
    expect(read('app.css')).toContain('color: rebeccapurple')
  })

  it('--extend naming no module exits 2, naming the specifier and the directory', () => {
    write('src/app.css', '.a { @nave flex; }\n')

    const run = expand('--source=src/app.css', '--out=app.css', '--extend=nope.mjs')

    expect(run.status).toBe(2)
    expect(run.stderr).toContain('nope.mjs')
  })

  it('--extend given twice exits 2', () => {
    write('src/app.css', '.a { @nave flex; }\n')
    write('one.mjs', 'export default {}\n')

    expect(
      expand('--source=src/app.css', '--out=app.css', '--extend=one.mjs', '--extend=one.mjs')
        .status,
    ).toBe(2)
  })

  it('an --out that is a symlink to its --source exits 2 and leaves the source as it was', () => {
    const source = '.a { @nave flex; }\n'
    write('src/app.css', source)
    symlinkSync(path.join(project.dir, 'src/app.css'), path.join(project.dir, 'alias.css'))

    const run = expand('--source=src/app.css', '--out=alias.css')

    expect(run.status).toBe(2)
    expect(read('src/app.css')).toBe(source)
  })

  it('an --out that cannot be written exits 2 and says so', () => {
    write('src/app.css', '.a { @nave flex; }\n')
    write('blocker', 'a file where a directory is needed')

    const run = expand('--source=src/app.css', '--out=blocker/app.css')

    expect(run.status).toBe(2)
    expect(run.stderr).toContain('Could not write blocker/app.css: ')
    expect(run.stderr).toContain('No file after it was written.')
  })

  it('--help prints usage naming both subcommands and exits 0', () => {
    const result = spawnSync(process.execPath, [BIN, 'expand', '--help'], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/navecss-core expand/)
  })

  it('the Vite plugin, the PostCSS adapter and the Lightning adapter never emit bare-import: the Quick start’s app.css goes through with no diagnostic', async () => {
    const quickStart = "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n"

    const postcssResult = await postcss([postcssPlugin()]).process(quickStart, { from: undefined })
    expect(postcssResult.warnings()).toEqual([])
    expect(postcssResult.css).toBe(quickStart)
    expect(expandText(quickStart, { onUnknown: 'warn' }).diagnostics).toEqual([])
    expect(() => lightningAdapter().expand(quickStart, 'app.css')).not.toThrow()
    const vite = await runHook({ code: quickStart, id: '/proj/app.css' })
    expect(vite.error).toBeUndefined()
    expect(vite.warnings).toEqual([])
  })
})

describe('AC-directive-core-42 — --watch', () => {
  const children: ChildProcess[] = []

  afterEach(() => {
    for (const child of children.splice(0)) child.kill()
  })

  async function until(check: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 10_000
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  it('rewrites --out when the source changes, and keeps running after a diagnostic', async () => {
    const source = write('src/app.css', '.a { @nave flex; }\n')
    const child = spawn(
      process.execPath,
      [BIN, 'expand', '--source=src/app.css', '--out=out/app.css', '--watch'],
      { cwd: project.dir, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    children.push(child)
    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const out = path.join(project.dir, 'out/app.css')

    await until(
      () => existsSync(out) && readFileSync(out, 'utf8').includes('display: flex'),
      'the first write',
    )

    writeFileSync(source, '.a { @nave block; }\n')
    await until(() => readFileSync(out, 'utf8').includes('display: block'), 'the rewrite')

    writeFileSync(source, '.a { @nave nope; }\n')
    await until(() => stderr.includes('unknown atom "nope"'), 'the diagnostic')
    expect(child.exitCode, 'the process stopped after a diagnostic').toBeNull()
    expect(readFileSync(out, 'utf8')).toContain('display: block')

    writeFileSync(source, '.a { @nave grid; }\n')
    await until(() => readFileSync(out, 'utf8').includes('display: grid'), 'the recovery write')
    expect(child.exitCode).toBeNull()
  }, 30_000)
})

describe('AC-directive-core-43 — a bare @import is reported, with the stylesheet to link instead', () => {
  const BARE = ["@import url('@navecss/core/layers');", "@import '@navecss/tokens/css';"]

  it.each(BARE)('%s gives one bare-import diagnostic and exits 1', (line) => {
    write('src/app.css', `${line}\n.a { @nave flex; }\n`)

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status).toBe(1)
    expect(run.stderr.match(/a browser cannot load/g)).toHaveLength(1)
    expect(run.stderr).toContain('src/app.css:1:1:')
    expect(existsSync(path.join(project.dir, 'app.css'))).toBe(false)
  })

  it('names the self-contained stylesheet, by path and by CDN URL', () => {
    write('src/app.css', "@import url('@navecss/core/layers');\n")

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.stderr).toContain(STANDALONE_PATH)
    expect(run.stderr).toContain(STANDALONE_CDN)
  })

  it('names the entry’s own file for @navecss/core/no-tokens, not the self-contained stylesheet', () => {
    write('src/app.css', "@import '@navecss/core/no-tokens';\n")

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain(NO_TOKENS_PATH)
    expect(run.stderr).toContain(NO_TOKENS_CDN)
    expect(run.stderr).not.toContain('standalone.css')
  })

  it('does not send a bridge import to the self-contained stylesheet, which holds no bridge', () => {
    write('src/app.css', "@import '@navecss/bridge/base-ui';\n")

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('a browser cannot load')
    expect(run.stderr).not.toContain('standalone.css')
  })

  it.each([
    "@import './theme.css';",
    "@import '../theme.css';",
    "@import '/x.css';",
    "@import url('/x.css');",
    "@import 'https://cdn.example/x.css';",
    '@import url(https://cdn.example/x.css);',
    "@import url('//cdn.example/x.css');",
    "@import 'data:text/css,.a{}';",
  ])('%s gives none', (line) => {
    write('src/app.css', `${line}\n.a { @nave flex; }\n`)

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status, run.all).toBe(0)
  })

  it("@import 'theme.css'; gives none when theme.css exists beside the output, where the browser looks", () => {
    write('public/theme.css', '.t { color: red; }\n')
    write('src/app.css', "@import 'theme.css';\n")

    const run = expand('--source=src/app.css', '--out=public/app.css')

    expect(run.status, run.all).toBe(0)
  })

  it("@import 'theme.css'; gives one bare-import when it does not", () => {
    write('src/app.css', "@import 'theme.css';\n")

    const run = expand('--source=src/app.css', '--out=public/app.css')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('names no file relative to the output')
  })

  it('a directory named like the import is not a stylesheet beside the output: still bare', () => {
    write('public/theme.css/inner.css', '.t { color: red; }\n')
    write('src/app.css', "@import 'theme.css';\n")

    expect(expand('--source=src/app.css', '--out=public/app.css').status).toBe(1)
  })

  it('a percent-encoded name that names a file beside the output is not bare', () => {
    write('public/theme file.css', '.t { color: red; }\n')
    write('src/app.css', "@import 'theme%20file.css';\n")

    expect(expand('--source=src/app.css', '--out=public/app.css').status).toBe(0)
  })

  it('a bare import written inside a comment or a string is not an import', () => {
    write(
      'src/app.css',
      "/* @import '@navecss/core'; */\n.a { content: \"@import '@navecss/core';\"; }\n",
    )

    expect(expand('--source=src/app.css', '--out=app.css').status).toBe(0)
  })

  it('is reported together with a directive problem in the same file, in source order, as one report', () => {
    write('src/app.css', "@import '@navecss/core';\n.a { @nave nope; }\n")

    const run = expand('--source=src/app.css', '--out=app.css')

    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(
      /src\/app\.css:1:1: .*a browser cannot load[\s\S]*1 more in this stylesheet:\n2:12: unknown atom "nope"/,
    )
  })

  it('expandText() never emits it, and neither does any adapter', () => {
    const css = "@import '@navecss/core';\n"

    expect(expandText(css, { onUnknown: 'warn' }).diagnostics).toEqual([])
  })
})
