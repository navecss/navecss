/**
 * What the global setup handed the page, or the reason it could not: an absent registry, or a
 * setup the browser config does not list, fails the criterion that asks.
 */
import { inject } from 'vitest'

import type { RegistryApps, RegistryCopies } from './browser-paths.ts'

const MISSING_SETUP =
  'the registry global setup did not run: the browser config must list test/browser/support/registry-consumer-app.global-setup.ts'

/**
The copies, without checking them, for a test file that builds its tests from them.
 */
export const copiesProvided = (): RegistryCopies | undefined => inject('registryCopies')

/**
The copies the setup wrote. Throws the setup's own message when it could not write them.
 */
export const requiredCopies = (): RegistryCopies => {
  const copies = inject('registryCopies')
  if (copies === undefined) throw new Error(MISSING_SETUP)
  if (copies.error !== undefined) throw new Error(copies.error)
  return copies
}

/**
The apps the setup built. Throws the setup's own message when it could not build them.
 */
export const requiredApps = (): RegistryApps => {
  const apps = inject('registryApps')
  if (apps === undefined) throw new Error(MISSING_SETUP)
  if (apps.error !== undefined) throw new Error(apps.error)
  return apps
}
