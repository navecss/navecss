/**
 * The problem text of a CSS Module whose class map did not parse. It lives alone, importing
 * nothing, so the report can name it without reaching the reader's modules.
 */
export const CLASS_MAP_NOT_PARSED =
  "the module could not be read, so the atoms it names would not ship: it is a CSS Module, and the JavaScript Vite wrote for its class map did not parse. A plugin that runs after Vite's CSS step has changed that JavaScript: have that plugin leave a CSS Module's JavaScript valid."
