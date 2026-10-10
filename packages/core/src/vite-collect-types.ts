import type { Problem } from './vite-problems.ts'
/**
 * What the collector takes and what it returns for one module.
 */
import type { SetupExposure, SetupExposures } from './vite-setup-member.ts'

export interface ReadOptions {
  /**
   * The import specifiers that bind Nave's `cx`: its own module, and every module listed in
   * `cxModules` that this module imports.
   */
  readonly cxSources: ReadonlySet<string>
  /**
   * The specifiers in `cxSources` that name a module listed in `cxModules`.
   */
  readonly declaredSources?: ReadonlySet<string>
  /**
   * Whether this module is itself listed in `cxModules`, so its exports of `cx` are judged as a
   * listed module's.
   */
  readonly isDeclared?: boolean
  /**
   * The names of the consumer's own atoms, which have no class.
   */
  readonly ownAtoms: ReadonlySet<string>
  /**
   * Whether this module belongs to a dependency, where a Nave class built from pieces is only
   * refused if the module also imports `cx`.
   */
  readonly isDependency: boolean
  /**
   * For a compiled Vue template: what its component's script exposes to it.
   */
  readonly setup?: SetupExposures | undefined
  /**
   * Whether the module is a compiled Vue component's `<script setup>`.
   */
  readonly isVueScript?: boolean
}

export interface ModuleReading {
  /**
   * Built-in atoms named by a readable `cx()` call.
   */
  readonly atoms: Set<string>
  /**
   * Built-in atoms whose class is written whole in the module.
   */
  readonly classes: Set<string>
  readonly problems: Problem[]
  /**
   * Where `cx.dynamic()` is called, and the call as the plugin reads it.
   */
  readonly dynamicCalls: { readonly construct: string; readonly offset: number }[]
  /**
   * For a compiled Vue `<script setup>`: what it exposes to its template.
   */
  readonly exposes: Map<string, SetupExposure>
  /**
   * Whether the module imports from a `cx` source, whether or not it uses the import.
   */
  readonly usesCx: boolean
}
