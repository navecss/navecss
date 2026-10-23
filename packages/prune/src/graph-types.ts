/**
 * What the import-graph reader takes and what it returns.
 */
import type { LocatedProblem } from '@navecss/core/collect'

import type { SelectedDirectory } from './entries.ts'
import type { ResolutionInputs } from './resolution-inputs.ts'
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
   * The modes whose files count for problems; files are read for atoms under both.
   */
  readonly modes: readonly Mode[]
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
  /**
   * The stylesheets the build can still hold, absolute: the ones the code imports, and every one
   * an `@import` or a `composes ... from` reaches from those.
   */
  readonly stylesheets: Set<string>
  /**
   * The stylesheets met that could not be read as CSS (unreadable, refused by the CSS parser, or
   * Sass), absolute: what they import is not known.
   */
  readonly unreadStylesheets: Set<string>
  /**
   * What the resolution of the files' imports depended on besides the files themselves.
   */
  readonly inputs: ResolutionInputs
  /**
   * For each file read, the files it imports (core's own left out), absolute.
   */
  readonly edges: Map<string, Set<string>>
  /**
   * The files that call `cx.dynamic()`, absolute.
   */
  readonly dynamicFiles: Set<string>
  /**
   * The packages under `node_modules` that call `cx.dynamic()` in a file a `pages/` entry
   * reaches.
   */
  readonly pagesDynamicPackages: Set<string>
}
