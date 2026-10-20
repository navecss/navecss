/**
 * What the registry's global setup (`test/browser/support/registry-consumer-app.global-setup.ts`)
 * hands the browser tests.
 */
import 'vitest'

import type { RegistryApps, RegistryCopies } from './browser-paths.ts'

declare module 'vitest' {
  interface ProvidedContext {
    registryApps?: RegistryApps
    registryCopies?: RegistryCopies
  }
}
