/**
 * The browser floor is stated in two READMEs, core's and this package's, and the two lists are the
 * same: a project reads whichever it opens first.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR, readmeOf, REPO_ROOT } from './support/readme.ts'

const core = readmeOf(path.join(REPO_ROOT, 'packages/core'))
const own = readmeOf(PACKAGE_DIR)

/**
 * The list a `browserslist` fence holds, or `undefined` when the README has none.
 */
function floorOf(readme: string): string[] | undefined {
  const list = /"browserslist":\s*(\[[^\]]*\])/u.exec(readme)?.[1]
  return list === undefined ? undefined : (JSON.parse(list) as string[])
}

describe('the browser floor', () => {
  it('is the same list in core’s README and the package README', () => {
    const floor = floorOf(core)
    // Control: core's README has one.
    expect(floor?.length).toBeGreaterThan(0)
    expect(floorOf(own)).toEqual(floor)
  })

  it('is read as different when one entry changes (control)', () => {
    const changed = own.replace('"chrome 125"', '"chrome 126"')
    expect(floorOf(changed)).not.toEqual(floorOf(core))
  })
})
