/**
 * Render runs only: Base UI warns, through `console.error`, whenever a test renders a part as an
 * element it does not expect (a button as a `section`, which the `render` prop checks do on
 * purpose). Those warnings are not what a run is about, and they bury the ones that are.
 */
const error = console.error.bind(console)

console.error = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].startsWith('Base UI:')) {
    return
  }
  error(...args)
}
