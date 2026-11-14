/**
 * AC-used-atoms-52 covers: the held take of a dependency importer the build cannot read names the
 * module that gives out `cx`, so the line it prints says which module the importer takes.
 */
import { describe, expect, it } from 'vitest'

import * as routes from '../src/vite-listed-routes.ts'

describe('AC-used-atoms-52 - the form of a dependency importer the build cannot read', () => {
  it('names the module the importer takes', () => {
    const taken = routes.unreadableFor(
      '/app/node_modules/@acme/ui/other.js',
      'node_modules/@acme/ui/cn.js',
    )

    expect(taken.isHeld).toBe(true)
    expect(taken.form).toBe('takes node_modules/@acme/ui/cn.js in a way the build cannot read')
  })

  it('is not held for the application’s importer', () => {
    const taken = routes.unreadableFor('/app/src/App.ts', 'src/cn.ts')

    expect(taken.isHeld).toBeUndefined()
    expect(taken.form).toBeUndefined()
  })
})
