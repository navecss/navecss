/**
 * Registered for every test file: what a row starts and leaves running is stopped when the row
 * ends, and what a file leaves running or on disk is cleared when the file ends, whether its rows
 * passed or not. A server a file starts before its rows, in `beforeAll`, stays up for them. A row
 * that stops its own server and removes its own app has nothing left for these.
 */
import { afterAll, afterEach, beforeEach } from 'vitest'

import { beginRow, killGroups, killGroupsStartedInRow, removeDirectories } from './leftovers.ts'

beforeEach(() => {
  beginRow()
})

afterEach(() => {
  killGroupsStartedInRow('SIGKILL')
})

afterAll(() => {
  killGroups('SIGKILL')
  removeDirectories()
})
