/**
 * The PostCSS config and `next.config` files of a project: read by the plugin's run, so a change
 * to either runs it again (webpack's cache key does not hold them).
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'

const POSTCSS_CONFIG = /^(?:postcss\.config\.(?:[cm]?[jt]s|json)|\.postcssrc(?:\..+)?)$/
const NEXT_CONFIG = /^next\.config\.(?:[cm]?[jt]s)$/

/**
 * The absolute paths of the config files found directly in `dir`, whatever their extension.
 */
export function configFilesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => POSTCSS_CONFIG.test(name) || NEXT_CONFIG.test(name))
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => path.join(dir, name))
  } catch {
    return []
  }
}
