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

globalThis.IS_REACT_ACT_ENVIRONMENT = true

configure({
  asyncWrapper: async (callback) => {
    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    try {
      return await callback()
    } finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous
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
  await act(async () => {
    root.render(element)
  })
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(next)
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
  }
}

/**
Unmounts everything this file rendered and empties the document.
 */
export const cleanup = async (): Promise<void> => {
  for (const { container, root } of mounted.splice(0)) {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
  document.body.replaceChildren()
  delete document.documentElement.dataset.baseUiInert
}

export const user = (): ReturnType<typeof userEvent.setup> => userEvent.setup()
