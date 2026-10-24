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

/**
 * Whether `dir` holds a `next.config`, whatever its extension.
 */
export function hasNextConfig(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => NEXT_CONFIG.test(name))
  } catch {
    return false
  }
}

/**
 * The name of the PostCSS config file found directly in `dir`, or a stand-in for one that is not a
 * file there (a `postcss` key in `package.json`).
 */
export function postcssConfigIn(dir: string): string {
  try {
    return readdirSync(dir).find((name) => POSTCSS_CONFIG.test(name)) ?? 'package.json'
  } catch {
    return 'package.json'
  }
}
