/**
 * Registered for every test file: what a row leaves running is stopped when the row ends, and what
 * a file leaves running or on disk is cleared when the file ends, whether its rows passed or not.
 * A row that stops its own server and removes its own app has nothing left for these.
 */
import { afterAll, afterEach } from 'vitest'

import { killGroups, removeDirectories } from './leftovers.ts'

afterEach(() => {
  killGroups('SIGKILL')
})

afterAll(() => {
  killGroups('SIGKILL')
  removeDirectories()
})
