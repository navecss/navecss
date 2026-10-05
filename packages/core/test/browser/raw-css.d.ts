/**
 * Vite's `?raw` import suffix (used to inline the real built CSS into these
 * browser-mode fixtures at bundle time) has no ambient type without pulling
 * in the whole `vite/client` type library, which core does not otherwise
 * depend on. This is the minimal declaration for the one suffix used here.
 */
declare module '*.css?raw' {
  const css: string
  // eslint-disable-next-line no-restricted-syntax -- an ambient `?raw` module must expose the file text as its default export; that is how every `import css from 'x.css?raw'` consumes it
  export default css
}
