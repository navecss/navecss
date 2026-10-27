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
const CSS_MODULE = /\.module\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
// The queries whose module is the stylesheet's text, not the JavaScript of its class map.
const TEXT_QUERY = /[?&](?:inline|direct|transform-only)\b/

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
 * Whether the module `id` is a CSS Module whose JavaScript is a class map: Vite's own test for a
 * CSS Module (`.module.` before a stylesheet extension, a query allowed), less the imports that
 * give the stylesheet's text and not its exports (`?inline`, `?direct`, `?transform-only`).
 */
export function isCssModuleId(id: string): boolean {
  return isStylesheetId(id) && CSS_MODULE.test(id) && !TEXT_QUERY.test(id)
}

/**
 * Whether the module `id` is a stylesheet whose text the plugin reads for its directives but
 * whose module it does not read for atoms: a stylesheet, except a CSS Module's class map.
 */
export function isUnreadStylesheet(id: string): boolean {
  return isStylesheetId(id) && !isCssModuleId(id)
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
