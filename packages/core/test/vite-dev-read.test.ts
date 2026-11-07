import { expect, it, vi } from 'vitest'

import { noteStartedRequests, waitForStartedRequests } from '../src/vite-dev-read.ts'

it('forgets a warm-up once it has ended, however it ended', async () => {
  const environment = {
    warmupRequest: (url: string) =>
      url === '/fails' ? Promise.reject(new Error('did not transform')) : Promise.resolve(),
  }
  noteStartedRequests(environment)
  await environment.warmupRequest('/a')
  try {
    await environment.warmupRequest('/fails')
  } catch {
    // It ended in an error, which is the case under test.
  }
  const settled = vi.spyOn(Promise, 'allSettled')
  await waitForStartedRequests(environment)
  expect([...settled.mock.calls[0]![0]]).toHaveLength(0)
  settled.mockRestore()
})
