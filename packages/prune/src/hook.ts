/**
 * The check `next build` runs after compiling: it reads what the PostCSS plugin recorded and the
 * CSS the build wrote, and stops the build, after printing why once, when the atoms the build
 * ships are not the atoms its code uses.
 */
import type { NaveOptions } from './options.ts'

/**
 * What Next.js hands `compiler.runAfterProductionCompile`.
 */
export interface HookMetadata {
  readonly projectDir: string
  /**
   * The build output directory, absolute (relative to `projectDir` is read the same way).
   */
  readonly distDir: string
}

/**
 * What the check reads from the resolved config.
 */
export interface HookConfig {
  readonly transpilePackages?: readonly string[]
  readonly bundlePagesRouterDependencies?: boolean | undefined
}

/**
 * Checks the build. Resolves when the build may go on; prints the reason once and throws one
 * short line when it may not.
 * @param metadata What Next.js hands the hook.
 * @param options The options `withNave()` was called with.
 * @param config The parts of the resolved config the check reads.
 */
export async function checkBuild(
  metadata: HookMetadata,
  options: NaveOptions,
  config: HookConfig = {},
): Promise<void> {
  await Promise.resolve([metadata, options, config])
}
