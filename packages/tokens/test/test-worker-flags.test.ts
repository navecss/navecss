import { expect, test } from 'vitest'

test('workers run without the baseline compiler, whose V8 crash kills a worker with SIGSEGV', () => {
  expect(process.execArgv).toContain('--no-sparkplug')
})
