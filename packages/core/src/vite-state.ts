/**
 * What the build has read so far, held at module scope: separate plugin instances per environment
 * are possible (Vite resolves a config, and makes a plugin list, for the builder's top level and
 * for each of its environments), and every environment of one build adds to the same set. The
 * build is told apart by the config object the host was handed, which all of those resolutions
 * share; a build that has begun reading closes its state, so the next build of the same root,
 * even from the same config object, starts a fresh one.
 */
import type { DeclaredModules } from './vite-cx-modules.ts'
import type { ReloadState } from './vite-dev-reloads.ts'
import type { Prepared } from './vite-listed-takes.ts'
import type { ServerImport } from './vite-server-takes.ts'
import type { SetupExposures } from './vite-setup-member.ts'
import type { DevEnvironmentLike } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'

import { freshReloads } from './vite-dev-reloads.ts'
import { withRestorers } from './vite-restorers.ts'

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
   * The listed files the module reads a `cx` from, when it reads no other `cx`.
   */
  readonly onlyVia?: ReadonlySet<string> | undefined
  /**
   * The package the module belongs to, when it lies under `node_modules`.
   */
  readonly pkg: string | undefined
  /**
   * Where the atoms came from, for the message naming a miss: the module's root-relative path.
   */
  readonly file: string
}

export interface RootState extends ReloadState {
  /**
   * Whether an environment has started building: the resolutions of one build all come before
   * that, so a resolution after it belongs to a later build.
   */
  started: boolean
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
   * The modules `cxModules` lists, resolved once for each environment, by environment name.
   */
  readonly declared: Map<string, Promise<DeclaredModules>>
  /**
   * The imports of a listed module that were recognised, by `<environment>\0<file>\0<importer>`:
   * the specifiers the importer was recognised through, for the build-end check against the module
   * graph.
   */
  readonly recognised: Map<string, Set<string>>
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
   * The imports the server environments of this process made of a listed package they leave
   * external, judged once the client has ended.
   */
  readonly serverImports: ServerImport[]
  /**
   * The client environment once it has ended: the files of its graph, and what it read of the
   * takes of the modules that give out `cx`, for a server environment that ends after it. It holds
   * no context, which the host may release once the environment has ended.
   */
  client:
    { readonly graph: ReadonlySet<string>; readonly prepared: readonly Prepared[] } | undefined
  /**
   * The environments the builder was going to build when it reached its last stage, and the ones
   * whose modules have been read since: the markup warning is judged when the second holds the
   * first.
   */
  expectedEnvironments: ReadonlySet<string> | undefined
  readonly builtEnvironments: Set<string>
  /**
   * The packages already warned about.
   */
  readonly warned: Set<string>
  /**
   * The stylesheets the dev server served filtered, by module id.
   */
  readonly served: Map<string, ServedSheet>
  /**
   * What the markup warning reads: whether an HTML page was read, a module of a server
   * environment was transformed, or a directive was expanded; and whether it was judged already.
   */
  htmlRead: boolean
  serverTransformed: boolean
  directiveExpanded: boolean
  markupJudged: boolean
  /**
   * Whether the dev server warms files up, so that a stylesheet is transformed with nobody asking
   * for it, and the stylesheets a request has asked for, by file: the warning waits for one.
   */
  warmedUp: boolean
  readonly requested: Set<string>
}

/**
 * What `stateFor` reads of a resolved config.
 */
interface ConfigLike {
  readonly command?: string
  readonly inlineConfig?: object
}

// Weakly held: a state lives as long as the config objects of its build do, so a long-lived
// process that builds many projects does not keep every project's state.
const byConfig = new WeakMap<object, Map<string, RootState>>()
const byBuild = new WeakMap<object, Map<string, RootState>>()

/**
 * The config object every resolution of one build shares, when `config` is one a build resolved.
 * A dev server holds one resolution, and a restart resolves again with a config of its own.
 */
function buildOf(config: ConfigLike): object | undefined {
  return config.command === 'build' ? config.inlineConfig : undefined
}

/**
 * The map of `owner` in `registry`, made when it has none.
 */
function mapOf(
  registry: WeakMap<object, Map<string, RootState>>,
  owner: object,
): Map<string, RootState> {
  const found = registry.get(owner) ?? new Map<string, RootState>()
  registry.set(owner, found)
  return found
}

/**
 * A state that has read nothing.
 */
function freshState(): RootState {
  return {
    started: false,
    modules: new Map(),
    exposures: new Map(),
    templateLinks: new Map(),
    packages: new Set(),
    declared: new Map(),
    recognised: new Map(),
    sheets: new Map(),
    pages: new Map(),
    emitted: undefined,
    externals: new Set(),
    clientEnded: false,
    serverImports: [],
    client: undefined,
    expectedEnvironments: undefined,
    builtEnvironments: new Set(),
    warned: new Set(),
    served: new Map(),
    ...freshReloads(),
    htmlRead: false,
    serverTransformed: false,
    directiveExpanded: false,
    markupJudged: false,
    warmedUp: false,
    requested: new Set(),
  }
}

/**
 * The state for `root` under the resolved config `config`: the one this config made, else the
 * one of the build it belongs to while that build has not started reading, else a new one.
 */
export function stateFor(root: string, config: ConfigLike): RootState {
  const known = byConfig.get(config)?.get(root)
  if (known) return known
  const build = buildOf(config)
  const shared = build && byBuild.get(build)?.get(root)
  const state = shared && !shared.started ? shared : freshState()
  mapOf(byConfig, config).set(root, state)
  if (build) mapOf(byBuild, build).set(root, state)
  return state
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
 * The atoms the dev server serves: what the build would emit as far as the dev server has read,
 * closed under the same pair.
 */
export function servedAtoms(state: RootState, kept: readonly string[]): Set<string> {
  return withRestorers(collectedAtoms(state, kept))
}

/**
 * The records of one environment.
 */
export function recordsOf(state: RootState, environment: string): ModuleRecord[] {
  const prefix = `${environment}\0`
  return [...state.modules].filter(([key]) => key.startsWith(prefix)).map(([, record]) => record)
}
