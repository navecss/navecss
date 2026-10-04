/**
 * What the build has read so far, held at module scope keyed by the project root: separate plugin
 * instances per environment are possible, and every environment of one `vite build` process adds
 * to the same set. A fresh resolved config for the same root starts a fresh state.
 */
import type { SetupExposures } from './vite-setup-member.ts'
import type { DevEnvironmentLike } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'

/**
 * A stylesheet the dev server served with the atomic layer filtered: the environment that serves
 * it and the set it was filtered to.
 */
interface ServedSheet {
  readonly environment: DevEnvironmentLike
  readonly atoms: ReadonlySet<string>
}

export interface Position {
  readonly file: string
  readonly line: number
  readonly column: number
  /**
   * The call as the plugin reads it, cut for the report.
   */
  readonly construct: string
  /**
   * The sentence that ends the report line when the call has no position.
   */
  readonly unknownLine?: string
}

export interface ModuleRecord {
  /**
   * The atoms the module names: readable `cx()` calls and written classes.
   */
  readonly atoms: ReadonlySet<string>
  readonly problems: readonly LocatedProblem[]
  /**
   * Problems a `keepFor` entry stands in for: kept so the cache file can say where they were.
   */
  readonly suppressed: readonly LocatedProblem[]
  readonly dynamicCalls: readonly Position[]
  /**
   * The package the module belongs to, when it lies under `node_modules`.
   */
  readonly pkg: string | undefined
  /**
   * Where the atoms came from, for the message naming a miss: the module's root-relative path.
   */
  readonly file: string
}

export interface RootState {
  /**
   * The resolved config this state was made for.
   */
  readonly config: object
  /**
   * Each environment's modules: `<environment>\0<id>` to what was read.
   */
  readonly modules: Map<string, ModuleRecord>
  /**
   * What each compiled `<script setup>` module exposes to its template, by `<environment>\0<id>`.
   */
  readonly exposures: Map<string, SetupExposures>
  /**
   * Which `<script setup>` module a template compiled apart from its component belongs to, by
   * `<environment>\0<template module id>`.
   */
  readonly templateLinks: Map<string, string>
  /**
   * The names of the packages with a module that some environment transformed.
   */
  readonly packages: Set<string>
  /**
   * The text of each stylesheet holding the atomic layer, by `<environment>\0<id>`.
   */
  readonly sheets: Map<string, string>
  /**
   * HTML entries read, by path: the atoms their classes name.
   */
  readonly pages: Map<string, ReadonlySet<string>>
  /**
   * The emitted set, fixed when the first stylesheet holding the layer was handed back to Vite.
   */
  emitted: ReadonlySet<string> | undefined
  /**
   * Packages a server environment left external that declare `@navecss/core`, not yet judged:
   * the client may still transform them.
   */
  readonly externals: Set<string>
  /**
   * Whether the client environment has finished reading its modules in this process.
   */
  clientEnded: boolean
  /**
   * The packages already warned about.
   */
  readonly warned: Set<string>
  /**
   * The stylesheets the dev server served filtered, by module id.
   */
  readonly served: Map<string, ServedSheet>
  /**
   * The served stylesheets whose set has grown since, waiting for the batched reload.
   */
  readonly stale: Set<string>
  /**
   * The stylesheets a reload was asked for and the page has not asked for again, by when.
   */
  readonly reloading: Map<string, number>
  reloadTimer: ReturnType<typeof setTimeout> | undefined
  /**
   * How many file changes are being read ahead of their update, which send the stylesheets they
   * outgrew in that update themselves, so the timer waits.
   */
  readAhead: number
  /**
   * What the markup warning reads: whether an HTML page was read, a module of a server
   * environment was transformed, or a directive was expanded; and whether it was judged already.
   */
  htmlRead: boolean
  serverTransformed: boolean
  directiveExpanded: boolean
  markupJudged: boolean
}

// Weakly held: a state lives as long as a plugin instance of its build does, so a long-lived
// process that builds many projects does not keep every project's state.
const registry = new Map<string, WeakRef<RootState>>()

/**
 * The state for `root` under the resolved config `config`: the existing one when this config made
 * it, a new one otherwise.
 */
export function stateFor(root: string, config: object): RootState {
  const existing = registry.get(root)?.deref()
  if (existing?.config === config) return existing
  const fresh: RootState = {
    config,
    modules: new Map(),
    exposures: new Map(),
    templateLinks: new Map(),
    packages: new Set(),
    sheets: new Map(),
    pages: new Map(),
    emitted: undefined,
    externals: new Set(),
    clientEnded: false,
    warned: new Set(),
    served: new Map(),
    stale: new Set(),
    reloading: new Map(),
    reloadTimer: undefined,
    readAhead: 0,
    htmlRead: false,
    serverTransformed: false,
    directiveExpanded: false,
    markupJudged: false,
  }
  registry.set(root, new WeakRef(fresh))
  return fresh
}

/**
 * The key a module is held under.
 */
export function moduleKey(environment: string, id: string): string {
  return `${environment}\0${id}`
}

/**
 * The atoms every environment has read so far, plus the pages' and the options' own.
 */
export function collectedAtoms(state: RootState, kept: readonly string[]): Set<string> {
  const atoms = new Set(kept)
  for (const record of state.modules.values()) for (const atom of record.atoms) atoms.add(atom)
  for (const page of state.pages.values()) for (const atom of page) atoms.add(atom)
  return atoms
}

/**
 * The records of one environment.
 */
export function recordsOf(state: RootState, environment: string): ModuleRecord[] {
  const prefix = `${environment}\0`
  return [...state.modules].filter(([key]) => key.startsWith(prefix)).map(([, record]) => record)
}
