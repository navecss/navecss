/**
 * R14: resolving the installed `@navecss/core`'s version, and reporting
 * the three DISTINCT ways that can fail — never collapsed into one `undefined`, which used
 * to mean both "no core installed at all" and "a core is installed but this build's own
 * mandated resolution route cannot read its version", so a `validate` run against an older
 * core silently reported as though no core were present, printing a manifest-recorded
 * version nobody had compared against.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { CoreContractManifest, ManifestVersionSkew } from './theming/core-contract.ts'

import { checkManifestVersionSkew } from './theming/core-contract.ts'

/**
 * `resolved` — real module resolution against `@navecss/core`'s own `"./package.json"`
 * export succeeded and the parsed version is in hand. `not-installed` — a rung-5 consumer
 * using only `@navecss/tokens`; the skew check has nothing to compare against and is
 * skipped. `unresolvable` — `@navecss/core` IS installed but does not declare a
 * `"./package.json"` export (an older core, predating that export; R14's own worked
 * example), so its version cannot be read via the mandated route at all. `unreadable` — the
 * installation itself is broken: the export resolved but the file could not be read or
 * parsed or carries no `version` field, OR the resolver found `@navecss/core` and could not
 * use it at all (found in quality review; R14's precision 3 sends a broken installation to
 * exit `2`, and that is the status which carries it).
 */
export type CoreVersionProbe =
  | { status: 'resolved'; version: string }
  | { status: 'not-installed' }
  | { status: 'unresolvable' }
  | { message: string; status: 'unreadable' }

/**
 * Whether `@navecss/core` is INSTALLED AT ALL, asked
 * positively rather than inferred from the subpath resolve's error code. R14's precision
 * observes in terms that its states are distinguishable "since resolving `@navecss/core`'s own
 * default entry succeeds in state 2 and fails in state 1", and this is that observation
 * exercised: a default entry that resolves proves the package is there, whatever went wrong
 * one subpath over.
 */
function canResolveCoreDefaultEntry(): boolean {
  try {
    import.meta.resolve('@navecss/core')
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the installed `@navecss/core`'s version via its own declared `"./package.json"`
 * export, distinguishing every way that can fail. No longer exported — `detectVersionSkew`
 * below is now the one call site, shared by `facade.ts`'s `build` and `validate`; a direct
 * caller wanting the raw probe without a skew comparison can still reach it through
 * `detectVersionSkew`'s own `probe` field.
 */
async function resolveInstalledCoreVersion(): Promise<CoreVersionProbe> {
  let resolved: string
  try {
    resolved = import.meta.resolve('@navecss/core/package.json')
  } catch (error) {
    // A later quality-review pass found that this used to sniff ONE code and drop every other
    // resolver failure into `not-installed` — the one state R14's precision 1 sends to exit
    // `0` with the printed sentence "No installed @navecss/core was found". Node throws at
    // least two further codes for a core that IS installed and IS broken
    // (`ERR_INVALID_PACKAGE_CONFIG` for an unparseable `package.json`,
    // `ERR_INVALID_PACKAGE_TARGET` for a `"./package.json"` mapped out of the package), so a
    // whole population of broken installations got a green run plus a false statement about
    // the consumer's own machine. R4's precision 4 states the dividing rule — "wherever the
    // run can TELL that the installation is what failed, it exits `2`" — and here the run can
    // tell: the resolver's own error names the file it choked on. R14's precision 3 is the
    // answer for that population, and `unreadable` is the status that carries it.
    //
    // `not-installed` is now a POSITIVE classification, held to the one resolver code that
    // means "I could not find this package" AND corroborated by the default entry also being
    // unreachable. Everything else means the resolver found something and could not use it.
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return { status: 'unresolvable' }
    if (code === 'ERR_MODULE_NOT_FOUND' && !canResolveCoreDefaultEntry()) {
      return { status: 'not-installed' }
    }
    return { message: (error as Error).message, status: 'unreadable' }
  }
  try {
    const raw = await readFile(fileURLToPath(resolved), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version !== 'string') {
      return {
        message: '"@navecss/core"\'s package.json has no "version" string field',
        status: 'unreadable',
      }
    }
    return { status: 'resolved', version: parsed.version }
  } catch (error) {
    return { message: (error as Error).message, status: 'unreadable' }
  }
}

/**
 * R14: the ONE place `facade.ts`'s `build` and `validate` both call
 * `resolveInstalledCoreVersion`/`checkManifestVersionSkew` — never `resolved`, no skew check
 * (see `TokensBuildResult.versionSkew`'s own doc for why that is not itself a skew).
 */
export async function detectVersionSkew(
  manifest: CoreContractManifest,
): Promise<{ probe: CoreVersionProbe; skew: ManifestVersionSkew | undefined }> {
  const probe = await resolveInstalledCoreVersion()
  const skew =
    probe.status === 'resolved' ? checkManifestVersionSkew(manifest, probe.version) : undefined
  return { probe, skew }
}
