/**
 * Which module ids carry stylesheet text the plugin should read, and what to call one in a
 * message. The test mirrors Vite's own (`isCSSRequest` and its special-query list): a stylesheet
 * by extension, so a Vue or Svelte style block (`Card.vue?vue&type=style&lang.scss`), an HTML
 * `<style>` proxy and a `?inline` import all count, and a `?raw` or `?url` import (whose module is
 * JavaScript, not CSS) does not. A `?url` import's own CSS reaches the plugin as
 * `?transform-only`.
 */
const STYLESHEET = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
const SPECIAL_QUERY = /[?&](?:worker|sharedworker|raw|url)\b/

/**
 * Whether the module `id` names a stylesheet by its extension, whatever it is imported as.
 */
export function isStylesheetPath(id: string): boolean {
  return STYLESHEET.test(id)
}

/**
 * Whether the module `id` is a stylesheet whose text the plugin should read.
 */
export function isStylesheetId(id: string): boolean {
  return STYLESHEET.test(id) && !SPECIAL_QUERY.test(id)
}

/**
 * Whether `code` could hold a directive at all: an at-sign followed by `n` (`@nave`, `@NAVE`) or
 * a backslash (`@n\61ve`, `@\6e ave`). A stylesheet with neither is left untouched, byte for byte.
 */
export function canHoldDirective(code: string): boolean {
  return /@[n\\]/i.test(code)
}

/**
 * The path part of `id`, without its query, for a message to name.
 */
export function filePathOf(id: string): string {
  const query = id.indexOf('?')
  return query === -1 ? id : id.slice(0, query)
}
