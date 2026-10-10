/**
 * A wait of a given length, for the tests that need real time to pass: a transition's exit, an app
 * that renders after it loads.
 */
export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
