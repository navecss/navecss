/**
 * What the import-graph reader takes and what it returns.
 */
import type { LocatedProblem } from '@navecss/core/collect'

import type { SelectedDirectory } from './entries.ts'
import type { Mode } from './resolve.ts'

export interface GraphOptions {
  readonly dir: string
  readonly keep: readonly string[]
  readonly keepFor: Readonly<Record<string, readonly string[]>>
  readonly cxModules: readonly string[]
  /**
   * The names of the consumer's own atoms, which have no class.
   */
  readonly ownAtoms: ReadonlySet<string>
  /**
   * The build's mode: files are read for atoms under both modes, for problems under this one.
   */
  readonly mode: Mode
}

export interface Graph {
  /**
   * The built-in atoms the files name: `cx()` calls and classes written whole.
   */
  readonly atoms: Set<string>
  readonly problems: LocatedProblem[]
  /**
   * Content digest of every file read, by absolute path.
   */
  readonly files: Map<string, string>
  /**
   * The Markdown and MDX files met, absolute, not read.
   */
  readonly markdown: Set<string>
  readonly directories: SelectedDirectory[]
}
