/**
 * Sentences the package prints besides the report, which core's formatter writes.
 */

/**
 * The plugin as the PostCSS config lists it, which is how a failure line names it.
 */
export const LISTED_NAME = '@navecss/prune/postcss'

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
  "withNave(): both @navecss/prune/postcss and @navecss/core/postcss are in your PostCSS config. Remove '@navecss/core/postcss': @navecss/prune/postcss expands @nave as well."

/**
 * The one-line version of `BOTH_PLUGINS` the development server prints.
 */
export const BOTH_PLUGINS_DEV =
  'Nave: both @navecss/prune/postcss and @navecss/core/postcss are in the PostCSS config. Remove @navecss/core/postcss: @navecss/prune/postcss expands @nave as well.'

/**
 * What the record holds is older than what is on disk.
 */
export function staleFile(name: string, cache: string): string {
  return `withNave(): ${name} changed after @navecss/prune/postcss read it, so this build cannot tell whether the atoms it ships match your code. Delete ${cache} ${REBUILD}.`
}

/**
 * The options changed since the plugin ran.
 */
export function staleOptions(cache: string): string {
  return `withNave(): the options given to withNave() changed after @navecss/prune/postcss read them, so this build cannot tell whether the atoms it ships match them. Delete ${cache} ${REBUILD}.`
}

/**
 * The plugin stopped before it finished.
 */
export function incomplete(failures: readonly string[], cache: string): string {
  return [
    "withNave(): @navecss/prune/postcss stopped before it finished, so this build's atoms were not checked:",
    ...new Set(failures),
    `If a line above says the extend option could not be used, fix extend in withNave(). Otherwise delete ${cache} ${REBUILD}, and if it stops again, report it to @navecss/prune with this output.`,
  ].join('\n')
}

/**
 * The CSS the build wrote does not hold the atoms the build read.
 */
export function outputMismatch(input: {
  readonly cache: string
  readonly file: string
  readonly missing: readonly string[]
  readonly output: string
  readonly stray: readonly string[]
}): string {
  const { cache, file, missing, output, stray } = input
  const parts = [
    ...(stray.length > 0
      ? [
          `it has a rule for ${stray.join(', ')} (first seen in ${file}), which this build does not keep`,
        ]
      : []),
    ...(missing.length > 0
      ? [`it has no rule for ${missing.join(', ')}, which this build keeps`]
      : []),
  ]
  return `withNave(): the CSS in ${output} does not match the atoms this build keeps: ${parts.join('; ')}. Delete ${cache} ${REBUILD}. If it fails again, look for a PostCSS plugin or other CSS step that edits @layer atomic, and if there is none, report it to @navecss/prune with this output.`
}

/**
 * A package calls `cx.dynamic()` where, by the config `withNave()` received, the Pages Router does
 * not bundle it. A wrapper applied after `withNave()` is not seen.
 */
export function pagesNotBundled(name: string): string {
  return `withNave(): ${name} calls cx.dynamic() in code a pages/ entry reaches, and the config withNave() received neither lists it in transpilePackages nor sets bundlePagesRouterDependencies: true. With that config the Pages Router does not bundle it, so cx.dynamic() there would not know which atoms this build kept. Add '${name}' to transpilePackages in next.config, or set bundlePagesRouterDependencies: true. withNave() does not see a wrapper applied after it, so if another wrapper sets either option, make withNave() the outermost: export default withNave(withOther(nextConfig)).`
}

/**
 * The build read no use of an atom.
 */
export const READS_NO_USE = `Nave: this build read no use of an atom, so its atom layer holds only what keep and keepFor name. A Nave class written where the build cannot read it, such as in text from a CMS, has no rule unless keep or keepFor lists its atom. See "What it cannot see": ${README}. If most of your Nave classes are written in such places, ship every atom instead: put '@navecss/core/postcss' in place of '@navecss/prune/postcss' in your PostCSS config, and remove withNave() from next.config.`

/**
 * The Markdown and MDX files the graph met and did not read.
 */
export function markdownWarning(files: readonly string[]): string {
  return `Nave: @navecss/prune does not read Markdown or MDX, so it did not read these files or the modules only they import: ${files.join(', ')}. An atom used only there has no rule unless keep or keepFor lists it. See "What it cannot see": ${README}.`
}
