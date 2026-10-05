/**
 * A small render harness for the render tests: React's own `createRoot` and `act`, so it runs the
 * React 18 or React 19 the run installed (the testing library's React adapter would bind its own
 * `react-dom`, which the React 18 runs must not do). Also wires `user-event` into `act`, the way
 * the testing library's adapter does, so a delivered event settles before the next line runs.
 */
import { configure } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const setActEnvironment = (value: boolean | undefined): void => {
  // eslint-disable-next-line unicorn/no-global-object-property-assignment -- React reads this flag off the global object
  globalThis.IS_REACT_ACT_ENVIRONMENT = value
}

// eslint-disable-next-line unicorn/no-top-level-side-effects -- the harness is wired once, on import
setActEnvironment(true)

// eslint-disable-next-line unicorn/no-top-level-side-effects -- the harness is wired once, on import
configure({
  asyncWrapper: async (callback) => {
    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT
    setActEnvironment(false)
    try {
      const result: unknown = await callback()
      return result
    } finally {
      setActEnvironment(previous)
    }
  },
  eventWrapper: (callback) => {
    let result: unknown
    void React.act(() => {
      result = callback()
    })
    return result
  },
})

export const act = React.act

/**
Runs work inside `act` and settles it, the way an `async` callback does.
 */
const settled = (work: () => void): Promise<void> =>
  act(() => {
    work()
    return Promise.resolve()
  })

export interface Mounted {
  readonly container: HTMLElement
  readonly rerender: (element: React.ReactElement) => Promise<void>
  readonly unmount: () => Promise<void>
}

const mounted: { container: HTMLElement; root: Root }[] = []

/**
Renders into a fresh container on an emptied `document.body`: Base UI leaves inert markers on
`body` after a portalled render unmounts, and they would shift every later comparison.
 */
export const render = async (element: React.ReactElement): Promise<Mounted> => {
  await cleanup()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mounted.push({ container, root })
  await settled(() => {
    root.render(element)
  })
  return {
    container,
    rerender: async (next) => {
      await settled(() => {
        root.render(next)
      })
    },
    unmount: async () => {
      await settled(() => {
        root.unmount()
      })
    },
  }
}

/**
Unmounts everything this file rendered and empties the document.
 */
export const cleanup = async (): Promise<void> => {
  const pending = [...mounted]
  mounted.length = 0
  for (const { container, root } of pending) {
    await settled(() => {
      root.unmount()
    })
    container.remove()
  }
  document.body.replaceChildren()
  delete document.documentElement.dataset.baseUiInert
}

export const user = (): ReturnType<typeof userEvent.setup> => userEvent.setup()
