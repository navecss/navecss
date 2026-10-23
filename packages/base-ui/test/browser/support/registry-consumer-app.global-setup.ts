/**
 * Writes what the registry's browser criteria stand on, before the page opens: the registry's copies
 * and their variants as source files the dev server can serve, and the consumer app built with
 * `vite build` with the Dialog copy beside the package (`test/support/registry/browser-setup.ts`).
 *
 * A step that cannot be made does not stop the run: its message is handed to the tests, which fail
 * with it, so an absent registry reds these criteria and leaves the rest of the suite running.
 */
import type { RegistryApps, RegistryCopies } from '../../support/registry/browser-paths.ts'

import { prepareApps, prepareCopies } from '../../support/registry/browser-setup.ts'

interface GlobalSetupContext {
  provide: (key: 'registryApps' | 'registryCopies', value: RegistryApps | RegistryCopies) => void
}

/**
Hands the copies and the built apps to the tests.
 */
export function setup({ provide }: GlobalSetupContext): void {
  provide('registryCopies', prepareCopies())
  provide('registryApps', prepareApps())
}
