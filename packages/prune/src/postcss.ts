import type { Plugin } from 'postcss'

/**
 * The Nave PostCSS plugin for Next.js. Slice stub: the real plugin replaces this.
 */
export function prunePlugin(_options: object = {}): Plugin {
  return { postcssPlugin: 'postcss-nave-prune' }
}
prunePlugin.postcss = true

export default prunePlugin
