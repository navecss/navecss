/**
 * AC-nextjs-used-atoms-07 on real builds: in a pnpm workspace the root is Turbopack's, a workspace
 * package re-runs the plugin, a file outside the root is caught in the build, and paths are the
 * app's. The app is `apps/web`; `packages/ui` is a workspace package that calls `cx('gap')`.
 * Three states: the workspace as it is; with `bad-lib`, a dependency holding three calls nothing
 * can read, installed in the store at the top; and with a module outside the workspace that a
 * tsconfig `paths` entry reaches. Every row runs on all four cells, cold and then warm.
 *
 * Two clauses hold on Turbopack only, as the criterion words them: the PostCSS worker runs in the
 * app's directory while the hand-off variable holds the top, and a declared file outside the root
 * is Turbopack's internal error. Both controls run on the newest Next.js.
 */
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Cell, Version } from '../helpers/next-cells.ts'
import type { WorkspaceApp } from '../helpers/workspace-fixture.ts'

import { SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import { pause } from '../helpers/next-process.ts'
import { createWorkspaceApp } from '../helpers/workspace-fixture.ts'

const TIMEOUT = 900_000

/**
 * Turbopack's internal error for a declared path outside its root: its wording is "leaves the
 * filesystem root" on some versions and "is outside configured roots" on others.
 */
const OUTSIDE_ROOT_ERROR = /leaves the filesystem root|is outside configured roots/i
const INTERNAL_ERROR = /panic|FATAL|TurbopackInternalError/i

const apps: WorkspaceApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

type Place = 'apps/web' | 'the top'

const PLACES: readonly Place[] = ['the top', 'apps/web']

/**
 * The Turbopack cells of `versions`.
 */
function turbopackCells(versions?: readonly Version[]): Cell[] {
  return cells(versions).filter((cell) => cell.bundler === 'turbopack')
}

/**
 * The webpack cells.
 */
function webpackCells(): Cell[] {
  return cells().filter((cell) => cell.bundler === 'webpack')
}

/**
 * A new workspace on the cell's Next.js, removed after the test.
 */
async function newApp(cell: Cell): Promise<WorkspaceApp> {
  const app = createWorkspaceApp(await nextRootOf(cell))
  apps.push(app)
  return app
}

/**
 * The arguments and working directory of `next build` run from `place`: `next build apps/web` at
 * the top, or `next build` in the app.
 */
function buildFrom(app: WorkspaceApp, cell: Cell, place: Place): [string[], string] {
  return place === 'the top'
    ? [['build', ...cell.flags, 'apps/web'], app.top]
    : [['build', ...cell.flags], app.dir]
}

/**
 * Whether `file` lies inside `directory`.
 */
function isInside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Every path the package declared to the bundler, from what the probe saw.
 */
function declared(app: WorkspaceApp): string[] {
  return app
    .probes()
    .flatMap((probe) => probe.messages)
    .flatMap((message) => [message.file, message.dir])
    .filter((entry): entry is string => entry !== undefined)
}

/**
 * Throws unless the first state holds after a green build run from `place`: the record lies in
 * `apps/web/.next/cache`, the package's messages name `packages/ui`'s
 * module and nothing outside the root, and the hand-off variable and the PostCSS worker's directory
 * are where the criterion places them.
 */
function expectFirstState(app: WorkspaceApp, cell: Cell, place: Place): void {
  expect(app.record(), 'the record lies in apps/web/.next/cache').toBeDefined()
  expect(app.record(app.top), 'no record lies in the top').toBeUndefined()
  const probes = app.probes()
  expect(probes.length, 'the probe saw the package finish with a stylesheet').toBeGreaterThan(0)
  const files = declared(app)
  expect(files).toContain(app.uiModule)
  expect(
    files.filter((file) => !isInside(app.root, file)),
    "nothing outside Turbopack's root is declared",
  ).toEqual([])
  for (const probe of probes) {
    const isTurbopack = cell.bundler === 'turbopack'
    const isFromTop = place === 'the top'
    const expectedWorker = isTurbopack || !isFromTop ? app.dir : app.top
    // The hand-off variable holds the top on Turbopack run from the top; webpack's callback replaces it
    // with its own project directory.
    const expectedVariable = isTurbopack && isFromTop ? app.top : app.dir
    expect(probe.handoff?.dir, 'the hand-off variable').toBe(expectedVariable)
    expect(probe.cwd, "the PostCSS worker's directory").toBe(expectedWorker)
  }
}

/**
 * The text a stale report names for a file outside the project, relative to the app.
 */
function relativeToApp(app: WorkspaceApp, file: string): string {
  return path.relative(app.dir, file).split(path.sep).join('/')
}

/**
 * The lines of `output` that open with `prefix`.
 */
function linesOpening(output: string, prefix: string): string[] {
  return output.split('\n').filter((line) => line.startsWith(prefix))
}

// Next.js 16.2.0 on webpack dies now and then, run from the workspace top, with an uncaught
// `Cannot read properties of undefined (reading 'length')` right after it starts the production
// build. It did not repeat in ten plain builds of the same fixture, and not when run from the app's
// directory, so a failed row runs again before it counts (the `retry` option below).
describe.skipIf(SKIP_REASON !== undefined)(
  `a pnpm workspace on real builds${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  { retry: 2 },
  () => {
    describe.each(PLACES)('first state, next build run from %s', (place) => {
      it.each(cells().map((cell) => [cell.name, cell] as const))(
        `AC-nextjs-used-atoms-07: %s: cold and warm builds are green, ship the package's atom and record in apps/web; a call no build can read is reported at app/page.tsx`,
        async (_name, cell) => {
          const app = await newApp(cell)
          const [args, cwd] = buildFrom(app, cell, place)

          const cold = await app.next(args, cwd)
          expect(cold.code, cold.output).toBe(0)
          expect(cold.output).not.toMatch(OUTSIDE_ROOT_ERROR)
          expectFirstState(app, cell, place)
          expect(app.builtCss()).toContain('.nave-gap')

          // The workspace package is inside the root, so the plugin runs again.
          app.clearProbes()
          app.lookAt('block')
          const warm = await app.next(args, cwd)
          expect(warm.code, warm.output).toBe(0)
          expect(warm.output).not.toMatch(OUTSIDE_ROOT_ERROR)
          expect(warm.output).not.toMatch(INTERNAL_ERROR)
          expectFirstState(app, cell, place)
          expect(app.builtCss()).toContain('.nave-block')
          expect(app.builtCss()).not.toContain('.nave-gap')

          // A call the build cannot read is reported with the app's own relative path.
          app.callVariable()
          const bad = await app.next(args, cwd)
          expect(bad.code, bad.output).not.toBe(0)
          expect(bad.output).toContain('1 problem in 1 file: ')
          expect(linesOpening(bad.output, 'app/page.tsx:'), bad.output).toHaveLength(1)
        },
        TIMEOUT,
      )
    })

    it.each(cells().map((cell) => [cell.name, cell] as const))(
      'AC-nextjs-used-atoms-07: %s: next dev apps/web from the top serves the package atom, records in apps/web, and serves the new rule after an edit with no restart',
      async (_name, cell) => {
        const app = await newApp(cell)
        const server = await app.dev([...cell.flags, 'apps/web'], app.top)
        expect(await server.css('/')).toContain('.nave-gap')
        expectFirstState(app, cell, 'the top')

        app.lookAt('block')
        let served = await server.css('/')
        for (let attempt = 1; !served.includes('.nave-block'); attempt += 1) {
          // A busy machine can lose the watcher's event for an edit: writing the file again sends another.
          if (attempt % 10 === 0) app.lookAt('block')
          await pause(1000)
          served = await server.css('/')
        }
        expect(served).not.toContain('.nave-gap')
        expect(server.output()).not.toMatch(/restart/i)
        await server.stop()
        expect(app.record()?.atoms ?? []).toContain('block')
        expect(app.record(app.top)).toBeUndefined()
      },
      TIMEOUT,
    )

    describe('control: the project directory taken from the hand-off variable alone', () => {
      it.each(turbopackCells(['newest']))(
        'AC-nextjs-used-atoms-07: $name: next build apps/web from the top puts the record in the top and ships no gap',
        async (cell) => {
          const app = await newApp(cell)
          // The scratch copy's project directory is the variable's, whatever directory the worker
          // runs in: the working-directory step of the package's project.js is removed.
          app.useScratchPlugin({
            file: 'project.js',
            from: 'export function projectHandoff(handoff, cwd = process.cwd()) {',
            to: 'export function projectHandoff(handoff) {\n    return handoff;\n}\nfunction unusedProjectHandoff(handoff, cwd = process.cwd()) {',
          })
          const [args, cwd] = buildFrom(app, cell, 'the top')
          await app.next(args, cwd)

          expect(app.record(app.top), 'the record lies in the top').toBeDefined()
          expect(app.record(), 'no record lies in apps/web').toBeUndefined()
          expect(app.builtCss()).not.toContain('.nave-gap')
          // The same checks as the first state's, which the scratch copy turns red.
          expect(() => {
            expectFirstState(app, cell, 'the top')
          }).toThrow('the record lies in apps/web/.next/cache')
        },
        TIMEOUT,
      )
    })

    describe.each(PLACES)(
      'second state: bad-lib in the store at the top, build run from %s',
      (place) => {
        it.each(cells().map((cell) => [cell.name, cell] as const))(
          "AC-nextjs-used-atoms-07: %s: the build fails and bad-lib's three problem lines open with a path relative to apps/web",
          async (_name, cell) => {
            const app = await newApp(cell)
            app.useBadLib()
            const [args, cwd] = buildFrom(app, cell, place)

            const run = await app.next(args, cwd)

            expect(run.code, run.output).not.toBe(0)
            expect(run.output).toContain('3 problems in 1 file: ')
            const lines = linesOpening(run.output, '../../node_modules/.pnpm/bad-lib@')
            expect(lines, run.output).toHaveLength(3)
            expect(lines.map((line) => /index\.js:(\d+):/u.exec(line)?.[1])).toEqual([
              '3',
              '5',
              '7',
            ])
            expect(
              linesOpening(run.output, app.top),
              'no line opens with an absolute path',
            ).toEqual([])
          },
          TIMEOUT,
        )
      },
    )

    describe.each(PLACES)(
      'third state: a module outside the workspace behind a tsconfig paths entry, build run from %s',
      (place) => {
        // Turbopack compiles nothing outside its root ("files outside of the workspace root are not
        // compiled", its own note), so a page cannot import a module there at all: the cold build
        // fails before the package's check has a file to catch. This is measured on 16.2.0 and on
        // 16.4.1, and it means the case the check was written for (a module outside the root, read
        // but declared to no bundler) cannot arise on Turbopack through an import.
        it.each(turbopackCells().map((cell) => [cell.name, cell] as const))(
          'AC-nextjs-used-atoms-07: %s: a module outside the root cannot be imported at all, so the cold build fails with Turbopack’s own message',
          async (_name, cell) => {
            const app = await newApp(cell)
            app.useExternal('hidden')
            const [args, cwd] = buildFrom(app, cell, place)

            const cold = await app.next(args, cwd)

            expect(cold.code, cold.output).not.toBe(0)
            expect(cold.output).toMatch(/Can't resolve '@ext\/x'|outside of the workspace root/u)
            expect(app.builtCss()).not.toContain('.nave-hidden')
          },
          TIMEOUT,
        )

        // Webpack has no root to stay inside, so the plugin declares what it read, the module
        // outside the workspace included, and the warm build re-runs the plugin instead of failing.
        it.each(webpackCells().map((cell) => [cell.name, cell] as const))(
          'AC-nextjs-used-atoms-07: %s: the module is read and ships its atom, webpack has no root so it is declared, and the warm build after its call changes ships the new atom',
          async (_name, cell) => {
            const app = await newApp(cell)
            app.useExternal('hidden')
            const [args, cwd] = buildFrom(app, cell, place)

            const cold = await app.next(args, cwd)
            expect(cold.code, cold.output).toBe(0)
            expect(app.builtCss()).toContain('.nave-hidden')
            const key = relativeToApp(app, app.external)
            expect(Object.keys(app.record()?.files ?? {}), 'x.ts is read').toContain(key)
            expect(declared(app)).toContain(app.external)

            app.externalAt('block')
            const warm = await app.next(args, cwd)
            expect(warm.code, warm.output).toBe(0)
            expect(app.builtCss()).toContain('.nave-block')
            expect(app.builtCss()).not.toContain('.nave-hidden')
          },
          TIMEOUT,
        )
      },
    )

    describe('control: a declared file outside the root', () => {
      it.each(turbopackCells(['newest']))(
        "AC-nextjs-used-atoms-07: $name: a scratch copy that adds a dependency on a file outside the root fails the cold build from the top with Turbopack's internal error",
        async (cell) => {
          const app = await newApp(cell)
          // The scratch copy's messages start with one `dependency` on the module outside the
          // workspace, which the package's own messages never name.
          app.useScratchPlugin({
            file: 'messages.js',
            from: 'const messages = [];',
            to: `const messages = [{ type: 'dependency', plugin: PLUGIN, file: ${JSON.stringify(app.external)}, parent }];`,
          })
          const [args, cwd] = buildFrom(app, cell, 'the top')

          const run = await app.next(args, cwd)

          expect(run.code, run.output).not.toBe(0)
          expect(run.output).toMatch(OUTSIDE_ROOT_ERROR)
          expect(run.output).toMatch(INTERNAL_ERROR)
          expect(declared(app)).toContain(app.external)
        },
        TIMEOUT,
      )
    })
  },
)
