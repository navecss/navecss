/**
 * AC-base-ui-bridge-19: the consumer side needs no PostCSS. The app was built by `vite build` from
 * the packed tarballs of this package and of the tokens (`support/consumer-app.global-setup.ts`),
 * with no PostCSS configuration and no Vite configuration, and opened here in a real browser.
 */
import { describe, expect, inject, it } from 'vitest'

import { sleep } from './support/wait.ts'

const build = inject('consumerBuild')

const CONFIGURATION_FILE = /^(?:postcss\.config\.|\.postcssrc|vite\.config\.)/

const loadApp = async (url: string): Promise<{ frame: HTMLIFrameElement; window: Window }> => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width: 800px; height: 600px; border: 0'
  document.body.append(frame)
  await new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => {
      resolve()
    })
    frame.addEventListener('error', () => {
      reject(new Error(`${url} did not load`))
    })
    frame.src = url
  })
  return { frame, window: frame.contentWindow! }
}

const until = async <Value>(find: () => Value | undefined): Promise<Value> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = find()
    if (found !== undefined) {
      return found
    }
    await sleep(50)
  }
  throw new Error('the app never rendered what the test waits for')
}

describe('AC-base-ui-bridge-19: the consumer side needs no PostCSS', () => {
  it('AC-base-ui-bridge-19: the app has no PostCSS configuration and no Vite configuration', () => {
    expect(build, 'the global setup ran').toBeDefined()
    expect(build!.appFiles.filter((name) => CONFIGURATION_FILE.test(name))).toEqual([])
  })

  it('AC-base-ui-bridge-19: vite build exits 0', () => {
    expect(build!.exitCode, build!.output).toBe(0)
  })

  it("AC-base-ui-bridge-19: the Button's computed border-top-color equals the computed --nave-color-border-control", async () => {
    expect(build!.exitCode, build!.output).toBe(0)
    const { frame, window } = await loadApp(build!.url)
    try {
      const button = await until(() => window.document.querySelector('#the-button') ?? undefined)
      const dialog = await until(() => window.document.querySelector('#the-dialog') ?? undefined)
      const root = window.document.documentElement
      const token = window.getComputedStyle(root).getPropertyValue('--nave-color-border-control')
      expect(token.trim(), 'the tokens loaded').not.toBe('')

      // The custom property's computed value is the colour as written (here a relative colour);
      // a border colour is read back resolved. A probe painted with the token gives the token in
      // the form the border reads in.
      const resolved = (name: string): string => {
        const probe = window.document.createElement('div')
        probe.style.borderTopColor = `var(${name})`
        window.document.body.append(probe)
        const colour = window.getComputedStyle(probe).borderTopColor
        probe.remove()
        return colour
      }

      expect(window.getComputedStyle(button).borderTopColor).toBe(
        resolved('--nave-color-border-control'),
      )
      expect(window.getComputedStyle(dialog).borderTopColor, 'the Dialog is styled too').toBe(
        resolved('--nave-color-border-default'),
      )
    } finally {
      frame.remove()
    }
  })
})
