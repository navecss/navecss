/**
 * The reset `@navecss/core` ships, as text, for the files that load it as a consumer sheet.
 */
declare module '@navecss/core/reset?raw' {
  const css: string
  // eslint-disable-next-line no-restricted-syntax -- an ambient `?raw` module must expose the file text as its default export; that is how every `import css from 'x.css?raw'` consumes it
  export default css
}
