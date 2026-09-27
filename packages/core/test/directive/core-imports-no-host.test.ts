/**
 * AC-directive-core-02: the core imports no host, and atomic.css renders
 * from the same data `resolve()` produces (R1).
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..', '..', 'src')
const DIST = path.resolve(HERE, '..', '..', 'dist')

const CORE_ENTRIES = [
  'directive/resolve.ts',
  'directive/plan.ts',
  'directive/expand-text.ts',
  'directive/diagnostics-format.ts',
]

const FORBIDDEN_HOSTS = [
  'postcss',
  'vite',
  'lightningcss',
  'rollup',
  'webpack',
  'esbuild',
  '@rspack/',
  'unplugin',
  'next',
]

const IMPORT_SPECIFIER = /\bimport\s+(?:type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_SPECIFIER = /\bimport\(\s*['"]([^'"]+)['"]/g

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const match of source.matchAll(IMPORT_SPECIFIER)) specifiers.push(match[1]!)
  for (const match of source.matchAll(DYNAMIC_IMPORT_SPECIFIER)) specifiers.push(match[1]!)
  return specifiers
}

/**
 * Every `.ts` module reachable from `entries` by relative import, walked
 * transitively; bare specifiers are collected but never followed (a bare
 * specifier is either a real dependency, checked below, or `@navecss/tokens`,
 * which the workspace resolves outside this package's own `src/`).
 */
function walkSourceGraph(entries: readonly string[]): {
  files: Set<string>
  bareSpecifiers: Set<string>
} {
  const files = new Set<string>()
  const bareSpecifiers = new Set<string>()
  const queue = [...entries]

  while (queue.length > 0) {
    const relative = queue.pop()!
    const absolute = path.resolve(SRC, relative)
    if (files.has(absolute)) continue
    files.add(absolute)

    const source = readFileSync(absolute, 'utf8')
    for (const specifier of extractSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        bareSpecifiers.add(specifier)
        continue
      }
      const next = path.resolve(path.dirname(absolute), specifier)
      queue.push(path.relative(SRC, next))
    }
  }

  return { files, bareSpecifiers }
}

function isAllowedBareSpecifier(specifier: string): boolean {
  return specifier.startsWith('node:') || specifier.startsWith('@navecss/tokens')
}

describe('AC-directive-core-02 — the core imports no host', () => {
  it('reaches only modules under src/directive/ and src/atoms.ts, src/selector-utils.ts', () => {
    const { files } = walkSourceGraph(CORE_ENTRIES)

    for (const file of files) {
      const relative = path.relative(SRC, file)
      expect(
        relative.startsWith(`directive${path.sep}`) ||
          relative === 'atoms.ts' ||
          relative === 'selector-utils.ts',
      ).toBe(true)
    }
    // A meaningful graph, not an empty one the assertion above trivially passes.
    expect(files.size).toBeGreaterThan(5)
  })

  it('imports no bare specifier other than a node: builtin or an @navecss/tokens subpath', () => {
    const { bareSpecifiers } = walkSourceGraph(CORE_ENTRIES)

    const disallowed = [...bareSpecifiers].filter((specifier) => !isAllowedBareSpecifier(specifier))
    expect(disallowed).toEqual([])
  })

  /**
   * The real guard: none of `FORBIDDEN_HOSTS` appears in `bareSpecifiers`. A
   * function, not inlined into the test body below, so the control can run
   * this SAME check against a tampered specifier set and show it throws,
   * rather than asserting a fact about the tampered text alone that never
   * exercises the guard at all.
   */
  function assertNoForbiddenHost(bareSpecifiers: ReadonlySet<string>): void {
    for (const host of FORBIDDEN_HOSTS) {
      const hit = [...bareSpecifiers].find((specifier) => specifier.startsWith(host))
      expect(hit, `${host} must not appear in the core's import graph`).toBeUndefined()
    }
  }

  it('never imports a host build tool, directly or transitively', () => {
    const { bareSpecifiers } = walkSourceGraph(CORE_ENTRIES)

    assertNoForbiddenHost(bareSpecifiers)
  })

  it('control: a scratch copy importing postcss from expandText’s own module reds the check', () => {
    const expandTextPath = path.resolve(SRC, 'directive/expand-text.ts')
    const original = readFileSync(expandTextPath, 'utf8')
    const { bareSpecifiers: before } = walkSourceGraph(CORE_ENTRIES)
    expect([...before].some((s) => s.startsWith('postcss'))).toBe(false)

    // A pure in-memory scan, not a filesystem write: re-run the same walker
    // against source text with the forbidden import spliced in, so the
    // control never touches the real file (append_le.py-style discipline —
    // no scratch file left behind, nothing for another test run to trip on).
    const tampered = `import postcss from 'postcss'\n${original}`
    const specifiers = extractSpecifiers(tampered)
    expect(specifiers).toContain('postcss')

    // The real assertion, run against the tampered specifier set: this is
    // what actually shows the guard catches the injected import, not just
    // that the low-level regex found the string "postcss" somewhere.
    const tamperedSpecifiers = new Set([...before, ...specifiers])
    expect(() => assertNoForbiddenHost(tamperedSpecifiers)).toThrow()
  })

  it('dist/: no entry other than postcss.js, and no shared chunk, mentions a host build tool', () => {
    if (!existsSync(DIST)) throw new Error('dist/ is missing — run the package build first')

    const files = readdirSync(DIST).filter((f) => f.endsWith('.js') && f !== 'postcss.js')
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = readFileSync(path.join(DIST, file), 'utf8')
      for (const host of FORBIDDEN_HOSTS) {
        expect(
          source.includes(`'${host}`) || source.includes(`"${host}`),
          `${file} mentions ${host}`,
        ).toBe(false)
      }
    }
  })

  it("build-css.ts renders every atom from resolve()'s own data, not a second traversal", () => {
    const buildCssSource = readFileSync(path.resolve(SRC, '..', 'scripts', 'build-css.ts'), 'utf8')

    expect(buildCssSource).toMatch(/from ['"]\.\.\/src\/directive\/resolve\.ts['"]/)
    expect(buildCssSource).toMatch(/resolve\(\[name\]\)/)
    // `renderNested`/`renderAtBlock` take `resolve()`'s own `ResolvedAtom`/
    // `ConditionalBlock` shapes (Declaration[], not Record<string, string>),
    // which is a shape `AtomDefinition` does not structurally satisfy — so a
    // reversion to reading `atoms.ts` directly, as `generateAtomCSS` did
    // before this fix, no longer type-checks. That is a stronger, durable
    // guarantee than a single runtime probe: it holds for every atom, not
    // just the one a test happens to construct.
    expect(buildCssSource).not.toMatch(/atom\.declarations\[|Object\.entries\(atom\.declarations\)/)
  })

  it("control: reversing one atom's declaration order changes dist/atomic.css", async () => {
    // Scratch dir lives INSIDE the package root, not os.tmpdir(): Node
    // resolves a bare specifier (`@navecss/tokens`) by walking up from the
    // importing file for a node_modules directory, and only the package
    // root's own (the pnpm workspace symlink) has one.
    const scratch = mkdtempSync(path.join(path.resolve(SRC, '..'), '.nave-build-css-scratch-'))
    try {
      cpSync(SRC, path.join(scratch, 'src'), { recursive: true })
      cpSync(path.resolve(SRC, '..', 'scripts'), path.join(scratch, 'scripts'), { recursive: true })

      const atomsPath = path.join(scratch, 'src', 'atoms.ts')
      const original = readFileSync(atomsPath, 'utf8')
      // `truncate` has three base declarations (overflow, text-overflow,
      // white-space) — swap the first two lines' textual order, a mechanical
      // transform on the source text; nothing here needs to know the full
      // shape, only that SOME reversal changes the built output.
      const truncateAt = original.indexOf('truncate: {')
      if (truncateAt === -1) throw new Error('truncate atom not found in scratch atoms.ts')
      const match =
        /declarations:\s*\{\n(\s*)(overflow: [^\n]+)\n(\s*)('text-overflow': [^\n]+)\n/.exec(
          original.slice(truncateAt),
        )
      if (!match) throw new Error('could not locate truncate’s first two declaration lines')
      const [wholeMatch, indentA, lineA, indentB, lineB] = match as unknown as [
        string,
        string,
        string,
        string,
        string,
      ]
      const swapped = `declarations: {\n${indentB}${lineB}\n${indentA}${lineA}\n`
      const mutated =
        original.slice(0, truncateAt) + original.slice(truncateAt).replace(wholeMatch, swapped)
      expect(mutated).not.toBe(original)
      writeFileSync(atomsPath, mutated)

      await new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(process.execPath, [path.join(scratch, 'scripts', 'build-css.ts')], {
          cwd: scratch,
        })
        let stderr = ''
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })
        child.on('error', rejectPromise)
        child.on('exit', (code) =>
          code === 0
            ? resolvePromise()
            : rejectPromise(new Error(`build-css.ts exited ${code}\n${stderr}`)),
        )
      })

      const scratchAtomic = readFileSync(path.join(scratch, 'dist', 'atomic.css'), 'utf8')
      const realAtomic = readFileSync(path.join(DIST, 'atomic.css'), 'utf8')
      expect(scratchAtomic).not.toBe(realAtomic)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
