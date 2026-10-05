/**
 * AC-directive-core-28 and AC-directive-core-40, from a consumer's side: `@navecss/core/lightningcss`
 * loaded by its package name, with its default export, in a project that has no `lightningcss`
 * installed (the adapter imports nothing from it, types included, so its declarations type-check
 * without it, with `skipLibCheck` off).
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

const consumer = { dir: '' }

beforeAll(() => {
  consumer.dir = mkdtempSync(path.join(tmpdir(), 'nave-core-lightning-'))
  // A copy of what the package publishes, with its one dependency beside it and nothing else: a
  // link back to the package directory would let `lightningcss` resolve from its devDependencies.
  const installed = path.join(consumer.dir, 'node_modules', '@navecss')
  mkdirSync(path.join(installed, 'core'), { recursive: true })
  cpSync(path.join(PACKAGE_ROOT, 'dist'), path.join(installed, 'core', 'dist'), { recursive: true })
  copyFileSync(
    path.join(PACKAGE_ROOT, 'package.json'),
    path.join(installed, 'core', 'package.json'),
  )
  symlinkSync(path.resolve(PACKAGE_ROOT, '../tokens'), path.join(installed, 'tokens'), 'dir')
  writeFileSync(
    path.join(consumer.dir, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
  )
})

afterAll(() => {
  rmSync(consumer.dir, { force: true, recursive: true })
})

interface Ran {
  readonly output: string
  readonly status: number
}

function run(args: string[]): Ran {
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: consumer.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { output: stdout, status: 0 }
  } catch (error) {
    const failed = error as { status?: number; stderr?: string; stdout?: string }
    return { output: `${failed.stdout ?? ''}${failed.stderr ?? ''}`, status: failed.status ?? 1 }
  }
}

function typecheck(name: string, source: string): Ran {
  writeFileSync(path.join(consumer.dir, name), source)
  writeFileSync(
    path.join(consumer.dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        lib: ['ES2022'],
        module: 'nodenext',
        moduleResolution: 'nodenext',
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        types: [],
      },
      files: [name],
    }),
  )
  return run([TSC, '-p', consumer.dir])
}

describe('@navecss/core/lightningcss, loaded by its package name', () => {
  it('loads, and its default export is the same function as the named navePlugin', () => {
    const script = [
      "import nave, { navePlugin } from '@navecss/core/lightningcss'",
      "const { code, map } = nave().expand('.a { @nave flex; }', 'a.css')",
      'console.log(JSON.stringify([nave === navePlugin, Buffer.from(code).toString(), typeof map]))',
    ].join('\n')

    const ran = run(['--input-type=module', '-e', script])

    expect(ran.status, ran.output).toBe(0)
    expect(JSON.parse(ran.output)).toEqual([true, '.a { display: flex; }', 'string'])
  })

  it('has no other default export on the other subpaths it sits beside', () => {
    const ran = run([
      '--input-type=module',
      '-e',
      "import * as cx from '@navecss/core/cx'; import * as atoms from '@navecss/core/atoms'; console.log('default' in cx, 'default' in atoms)",
    ])

    expect(ran.output.trim()).toBe('false false')
  })

  it('the consumer really has no lightningcss to resolve', () => {
    const ran = run(['--input-type=module', '-e', "await import('lightningcss')"])

    expect(ran.status).not.toBe(0)
    expect(ran.output).toMatch(/Cannot find package 'lightningcss'/)
  })

  it('its declarations type-check with skipLibCheck off, in a project with no lightningcss installed', () => {
    const ran = typecheck(
      'use.mts',
      [
        "import nave, { navePlugin } from '@navecss/core/lightningcss'",
        "const adapter: ReturnType<typeof nave> = navePlugin({ onUnknown: 'warn' })",
        "const result: { code: Uint8Array; map: string } = adapter.expand('.a {}', 'a.css')",
        "const text: string = adapter.resolver.read('a.css')",
        'export { result, text }',
        '',
      ].join('\n'),
    )

    expect(ran.status, ran.output).toBe(0)
  })

  it('control: an option that does not exist is a type error', () => {
    const ran = typecheck(
      'bad.mts',
      "import { navePlugin } from '@navecss/core/lightningcss'\nnavePlugin({ visitor: {} })\n",
    )

    expect(ran.status).not.toBe(0)
    expect(ran.output).toMatch(/visitor/)
  })
})
