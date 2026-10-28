/**
 * The used-atoms criteria for a build that stays up (`vite build --watch`): each rebuild fixes its
 * own emitted set, hands the page's inline stylesheet back pruned to it, and says what it has to
 * say again, once for that build.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createLogger } from 'vite'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_CSS, atomLayerAtoms, makeUsedApp } from './helpers/used-atoms-app.ts'
import { appConfig, VITE_APIS } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"

// What the row may take (the timeout it is declared with), how long before that the row's own waits
// give up so that the error names what never happened, and how long an edit waits to be heard
// before it is written again.
const ROW_TIMEOUT = 480_000
const GIVE_UP_BEFORE_TIMEOUT = 30_000
const REWRITE_AFTER = 10_000
const CLOSE_LIMIT = 10_000
// A watcher that has heard no file change through this many rewrites in a row (a minute) is closed
// and the watched build started again, once. A silence has ended by itself after longer than that,
// and a new watcher can be as deaf as the old one, so what the restart gives the row is a build
// that shows the edit without being told of it, not a watcher that hears.
const UNHEARD_REWRITES_BEFORE_RESTART = 6
const RESTARTS_ALLOWED = 1

// Closing a watcher waits for a build under way, and on a loaded machine that took longer than the
// time the row had left, so that the row ended on its timeout instead of on its own error.
async function atMost(ms: number, work: Promise<void> | undefined): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([work, limit])
  } finally {
    clearTimeout(timer)
  }
}

// Each Vite builds, rebuilds and writes a page's inline stylesheet by its own code, so this row
// runs on each Vite measured. The watcher hears of an edit from the operating system, which on a
// busy macOS machine tells it many seconds late and sometimes not at all, so the row writes an
// edit again, to the same effect, until the build's output shows it. Its waits end only a little
// before the row's timeout, which only has to outlast a loaded machine. A watcher that stays deaf
// through a minute of rewrites is closed and the watched build started again, once. That build's
// first output is not a rebuild, so the row then requires that a rebuild showed at least one of the
// first two edits, and the other rules (what each build shows, one warning per build) run across
// both watchers.
describe.each(Object.entries(VITE_APIS))(
  'Vite %s: AC-used-atoms-27 - rebuilds in watch mode',
  (_version, api) => {
    it('hands the inline stylesheet of a page back pruned on every rebuild, and warns once per build', async () => {
      const app = makeUsedApp({
        'index.html': `<!doctype html><html><head><style>@import url('@navecss/core/layers');@import url('@navecss/core');</style></head><body><script type="module" src="/src/main.ts"></script></body></html>`,
        'src/app.css': APP_CSS,
        'src/inline.css': APP_CSS,
        'src/a.ts': "import css from './inline.css?inline'\nexport const a = css\n",
        'src/main.ts': `import './app.css'\nimport { a } from './a.ts'\n${IMPORT}console.log(cx('flex'), a)\n`,
      })
      const warnings: string[] = []
      let closing: { close(): Promise<void> } | undefined
      const logger = createLogger('silent')
      logger.warn = (message) => {
        warnings.push(message)
      }
      const deadline = Date.now() + ROW_TIMEOUT - GIVE_UP_BEFORE_TIMEOUT
      try {
        const config = {
          ...appConfig(app.root, 'postcss', [navePlugin()], {
            build: { write: true, watch: {}, outDir: 'dist' },
          }),
          customLogger: logger,
        }
        interface Watcher {
          close(): Promise<void>
          on(event: 'event', listener: (event: { code: string; error?: Error }) => void): void
          on(event: 'change', listener: () => void): void
        }
        const written = (): { asset: string[]; page: string[] } => {
          const assets = path.join(app.root, 'dist/assets')
          const css = readdirSync(assets)
            .filter((name) => name.endsWith('.css'))
            .map((name) => readFileSync(path.join(assets, name), 'utf8'))
            .join('\n')
          const html = readFileSync(path.join(app.root, 'dist/index.html'), 'utf8')
          return { page: atomLayerAtoms(html), asset: atomLayerAtoms(css) }
        }
        // What the output shows now, or that it shows nothing yet.
        const shownNow = (): ReturnType<typeof written> | 'no output' => {
          try {
            return written()
          } catch {
            return 'no output'
          }
        }
        const shows = (): string => JSON.stringify(shownNow())
        const builds = {
          bundled: 0,
          changes: 0,
          ended: 0,
          failed: undefined as Error | undefined,
          lastBuildEventAt: undefined as number | undefined,
          lastChangeAt: undefined as number | undefined,
          restarts: 0,
          started: 0,
        }
        const ago = (at: number | undefined): string =>
          at === undefined ? 'none yet' : `${Date.now() - at} ms ago`
        // What the watcher has done so far, for the error that says what never happened: a write it
        // never heard leaves the last file change it heard older than that write.
        const progress = (): string =>
          `builds started ${builds.started}, ended ${builds.ended}, bundled ${builds.bundled}; last build event ${ago(builds.lastBuildEventAt)}, last file change heard ${ago(builds.lastChangeAt)}; restarts ${builds.restarts}`
        // What the output shows when each build ends, with the number of the edit whose first write
        // came before the build ended (0 for the first build), and whether the build was a rebuild:
        // one that its watcher ran after it had already ended a build. No build is under way when an
        // edit is first written, so each of those builds read that edit.
        const outputs: { afterEdit: number; output: unknown; rebuilt: boolean }[] = []
        let editing = 0
        // Starts the watched build and listens to it. Every watcher counts into the same totals.
        const watch = async (): Promise<void> => {
          const watcher = (await api.build(config)) as unknown as Watcher
          closing = watcher
          let hasEndedBuild = false
          watcher.on('change', () => {
            builds.changes += 1
            builds.lastChangeAt = Date.now()
          })
          watcher.on('event', (event) => {
            builds.lastBuildEventAt = Date.now()
            switch (event.code) {
              case 'BUNDLE_END': {
                builds.bundled += 1
                outputs.push({ afterEdit: editing, output: shownNow(), rebuilt: hasEndedBuild })
                break
              }
              case 'BUNDLE_START': {
                builds.started += 1
                break
              }
              case 'END': {
                builds.ended += 1
                hasEndedBuild = true
                break
              }
              case 'ERROR': {
                builds.failed = event.error ?? new Error('the watched build reported an error')
                break
              }
            }
          })
        }
        await watch()
        const wait = (ms: number): Promise<void> =>
          new Promise((resolve) => setTimeout(resolve, ms))
        // A failed build is reported at once, wherever the row is waiting, not after its budget.
        const throwIfFailed = (): void => {
          if (builds.failed !== undefined) throw builds.failed
        }
        // Whether the output holds exactly `atoms` for the page and for its stylesheet.
        const isShown = (atoms: string[]): boolean =>
          isDeepStrictEqual(shownNow(), { page: atoms, asset: atoms })
        // Waits for up to `ms` for the output to show `atoms` with no build under way.
        const isShownWithin = async (atoms: string[], ms: number): Promise<boolean> => {
          const end = Math.min(Date.now() + ms, deadline)
          while (Date.now() < end) {
            throwIfFailed()
            if (isShown(atoms) && builds.started === builds.ended) return true
            await wait(50)
          }
          return false
        }
        // Waits for the build that has just started to show `atoms`, as long as the row may take.
        const untilBuildShows = async (which: string, atoms: string[]): Promise<void> => {
          while (!(await isShownWithin(atoms, REWRITE_AFTER))) {
            throwIfFailed()
            if (Date.now() >= deadline) {
              throw new Error(
                `${which} never showed ${atoms.join(', ')}; it shows ${shows()}; ${progress()}`,
              )
            }
          }
        }
        // The rewrites in a row that the watcher has not heard a file change through.
        let unheardRewrites = 0
        const edit = async (call: string, atoms: string[]): Promise<void> => {
          editing += 1
          for (let attempt = 0; Date.now() < deadline; attempt += 1) {
            throwIfFailed()
            // A build reads main.ts only once its BUNDLE_START has been heard, so writing while none
            // is under way keeps a build from reading the file between its truncation and its write.
            while (builds.started !== builds.ended && Date.now() < deadline) await wait(50)
            const changesBefore = builds.changes
            // A comment changes no class, so the edit reads the same on every attempt.
            writeFileSync(
              path.join(app.root, 'src/main.ts'),
              `import './app.css'\nimport { a } from './a.ts'\n${IMPORT}console.log(${call}, a) // ${attempt}\n`,
            )
            const isShownNow = await isShownWithin(atoms, REWRITE_AFTER)
            throwIfFailed()
            unheardRewrites = builds.changes === changesBefore ? unheardRewrites + 1 : 0
            if (isShownNow) return
            if (
              unheardRewrites >= UNHEARD_REWRITES_BEFORE_RESTART &&
              builds.started === builds.ended &&
              builds.restarts < RESTARTS_ALLOWED
            ) {
              await atMost(CLOSE_LIMIT, closing?.close())
              builds.restarts += 1
              unheardRewrites = 0
              await watch()
              await untilBuildShows('the restarted build', atoms)
              return
            }
          }
          throw new Error(
            `the build never showed ${atoms.join(', ')}; it shows ${shows()}; ${progress()}`,
          )
        }

        await untilBuildShows('the first build', ['flex'])
        const first = written()
        await edit("cx('flex', 'grid')", ['flex', 'grid'])
        const second = written()
        await edit("cx('block')", ['block'])
        const third = written()

        expect(first).toEqual({ page: ['flex'], asset: ['flex'] })
        expect(second).toEqual({ page: ['flex', 'grid'], asset: ['flex', 'grid'] })
        expect(third).toEqual({ page: ['block'], asset: ['block'] })
        // A rebuild may only ever show the edit it follows, however late the watcher heard of it.
        const stages = [first, second, third]
        for (const { afterEdit, output } of outputs) {
          expect(output, `a build after edit ${afterEdit}`).toEqual(stages[afterEdit])
        }
        // The restarted build's first output is not a rebuild, so the rebuilds must still have shown
        // at least one of the first two edits.
        const rebuiltEdits = new Set(
          outputs.filter((entry) => entry.rebuilt).map((entry) => entry.afterEdit),
        )
        const isRestartUnproven =
          builds.restarts > 0 && !rebuiltEdits.has(1) && !rebuiltEdits.has(2)
        expect(
          isRestartUnproven,
          `after the restart, no rebuild showed edit 1 or edit 2; ${progress()}`,
        ).toBe(false)
        expect(builds.started).toBe(builds.ended)
        // One warning for each build that produced output, however many builds the edits caused.
        expect(warnings.filter((message) => message.includes('src/inline.css'))).toHaveLength(
          builds.bundled,
        )
      } finally {
        await atMost(CLOSE_LIMIT, closing?.close())
        app.dispose()
      }
    }, 480_000)
  },
)
