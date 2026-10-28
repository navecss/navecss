/**
 * The cells the real-build rows run in: a bundler on a Next.js version. Turbopack is Next.js 16's
 * default, webpack is `--webpack`, the newest version is the one the workspace installed and the
 * floor is the oldest the package supports.
 */
import { FLOOR_VERSION, floorNextRoot } from './next-floor.ts'
import { NEXT_ROOT } from './next-process.ts'

export type Bundler = 'turbopack' | 'webpack'
export type Version = 'floor' | 'newest'

export interface Cell {
  readonly bundler: Bundler
  /**
   * The flags `next build` and `next dev` take to run on this cell's bundler.
   */
  readonly flags: readonly string[]
  /**
   * `turbopack, newest` and the like, for a test title.
   */
  readonly name: string
  readonly version: Version
}

const BUNDLER_FLAGS: Record<Bundler, readonly string[]> = { turbopack: [], webpack: ['--webpack'] }

/**
 * The four cells, newest first, or the two of one version.
 */
export function cells(versions: readonly Version[] = ['newest', 'floor']): Cell[] {
  return versions.flatMap((version) =>
    (['turbopack', 'webpack'] as const).map((bundler) => ({
      bundler,
      flags: BUNDLER_FLAGS[bundler],
      name: `${bundler}, ${version === 'floor' ? FLOOR_VERSION : 'newest'}`,
      version,
    })),
  )
}

/**
 * Where the cell's `next` is installed, installing the floor's the first time it is asked for.
 */
export async function nextRootOf(cell: Cell): Promise<string> {
  if (cell.version === 'floor') return floorNextRoot()
  if (NEXT_ROOT === undefined) throw new Error('next is not installed for this package')
  return NEXT_ROOT
}

/**
 * The browser floor core's README gives for Next.js, which Turbopack builds for nested CSS.
 */
export const README_FLOOR = ['chrome 125', 'edge 125', 'firefox 128', 'safari 18', 'ios_saf 18']

/**
 * A floor old enough that Lightning CSS lowers CSS nesting, so the layer is written out rather
 * than nested.
 */
export const LOWERING_FLOOR = ['chrome 100', 'safari 15']
