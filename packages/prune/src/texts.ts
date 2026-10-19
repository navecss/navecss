/**
 * The sentences the package prints on its own, as opposed to the report, which core's formatter
 * writes. Each names what to change.
 */

const README = 'https://github.com/navecss/navecss/tree/main/packages/prune#what-it-cannot-see'
const REBUILD = 'and run next build again'

/**
 * The line that closes the report in `next dev`, where nothing stops.
 */
export const DEV_CLOSING_LINE =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'

/**
 * The line that says the problems a dev report listed are gone.
 */
export const DEV_FIXED_LINE = 'Nave: the problems listed earlier are fixed.'

/**
 * The alias line of the remedy block, printed once when an import cannot be resolved.
 */
export const ALIAS_REMEDY =
  "If Next.js resolves an import above through an alias set in next.config (turbopack.resolveAlias or webpack's resolve.alias), set the same alias in compilerOptions.paths in tsconfig.json or jsconfig.json."

/**
 * The throw that ends a build the hook stopped, after the reason was printed.
 */
export function stopLine(count: number): string {
  return `Nave stopped the build: ${count} ${count === 1 ? 'problem' : 'problems'}, listed above.`
}

/**
 * The wrapper is there and no run of the plugin left a record.
 */
export const NO_RECORD =
  "withNave(): no record from @navecss/prune/postcss in this build, so no atom was trimmed and no cx() call was checked. In your PostCSS config's plugins, put '@navecss/prune/postcss': {} in place of '@navecss/core/postcss', or add it if neither is there."

/**
 * Both Nave plugins are in the PostCSS config.
 */
export const BOTH_PLUGINS =
  "withNave(): both @navecss/prune/postcss and @navecss/core/postcss are in your PostCSS config. Remove '@navecss/core/postcss': @navecss/prune/postcss expands @nave as well, and core's plugin throws on a @nave problem."

/**
 * The one-line version of `BOTH_PLUGINS` the development server prints.
 */
export const BOTH_PLUGINS_DEV =
  'Nave: both @navecss/prune/postcss and @navecss/core/postcss are in the PostCSS config. Remove @navecss/core/postcss: @navecss/prune/postcss expands @nave as well.'

/**
 * What the record holds is older than what is on disk.
 */
export function staleFile(name: string, cache: string): string {
  return `withNave(): ${name} changed after the plugin read it, so the atoms this build ships come from an older read of your code. Delete ${cache} ${REBUILD}.`
}

/**
 * The options changed since the plugin ran.
 */
export function staleOptions(cache: string): string {
  return `withNave(): the options given to withNave() differ from the ones the plugin trimmed with, so the atoms this build ships come from an older read of your code. Delete ${cache} ${REBUILD}.`
}

/**
 * The plugin stopped before it finished.
 */
export function incomplete(failures: readonly string[], cache: string): string {
  return `withNave(): the plugin did not finish, so this build's atoms were not checked: ${failures.join(' ')} Delete ${cache} ${REBUILD}. If it stops again, report it to @navecss/prune with this output.`
}

/**
 * The CSS the build wrote does not hold the atoms the build read.
 */
export function outputMismatch(input: {
  readonly cache: string
  readonly file: string
  readonly missing: readonly string[]
  readonly stray: readonly string[]
}): string {
  const { file, missing, stray, cache } = input
  const parts = [
    ...(stray.length > 0 ? [`a rule for ${stray.join(', ')}, which this build did not read`] : []),
    ...(missing.length > 0 ? [`no rule for ${missing.join(', ')}, which this build read`] : []),
  ]
  return `withNave(): ${file} does not hold the atoms this build read (${parts.join('; ')}), so it was built from an older read of your code. Delete ${cache} ${REBUILD}. If it fails again, report it to @navecss/prune with this output.`
}

/**
 * A package calls `cx.dynamic()` where the Pages Router does not bundle it.
 */
export function pagesNotBundled(name: string): string {
  return `withNave(): ${name} calls cx.dynamic() in code a pages/ entry reaches, and the Pages Router does not bundle it, so cx.dynamic() would not know which atoms this build kept there. Add '${name}' to transpilePackages in next.config, or set bundlePagesRouterDependencies: true.`
}

/**
 * The build read no use of an atom.
 */
export const READS_NO_USE = `Nave: this build read no use of an atom, so its atom layer holds only what keep and keepFor name. A Nave class that reaches the page another way, such as text from a CMS, has no rule. See "What it cannot see": ${README}. If your classes come from outside your code, @navecss/core/postcss ships every atom.`

/**
 * The Markdown and MDX files the graph met and did not read.
 */
export function markdownWarning(files: readonly string[]): string {
  return `Nave: these Markdown and MDX files were not read, so the cx() calls and Nave classes in them, and in the modules only they import, have no rule: ${files.join(', ')}. See "What it cannot see": ${README}.`
}
