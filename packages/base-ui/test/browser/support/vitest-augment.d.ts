/**
 * What the browser config hands the tests: the values it provides and the command it registers.
 */
import 'vitest'
import 'vitest/browser'

import type { ConsumerBuild } from './consumer-app.global-setup.ts'

declare module 'vitest' {
  interface ProvidedContext {
    /**
    The Base UI version the project's tests run against.
     */
    baseUi: string
    consumerBuild?: ConsumerBuild
  }
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateReducedMotion: (reducedMotion: 'no-preference' | 'reduce') => Promise<void>
  }
}
