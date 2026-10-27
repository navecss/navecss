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
 * The list the first `browserslist` fence in `text` holds, or `undefined` when there is none.
 */
function listIn(text: string): string[] | undefined {
  const list = /"browserslist":\s*(\[[^\]]*\])/u.exec(text)?.[1]
  return list === undefined ? undefined : (JSON.parse(list) as string[])
}

/**
 * Core's floor for Next.js: the list in the section "Next.js", where a Next.js project copies it
 * from, and not the first list elsewhere in the README.
 */
function coreFloor(): string[] | undefined {
  const start = core.indexOf('#### Next.js')
  return start === -1 ? undefined : listIn(core.slice(start))
}

describe('the browser floor', () => {
  it('is the same list in core’s README and the package README', () => {
    const floor = coreFloor()
    // Control: core's README has one in that section.
    expect(floor?.length).toBeGreaterThan(0)
    expect(listIn(own)).toEqual(floor)
  })

  it('is read as different when one entry changes (control)', () => {
    const changed = own.replace('"chrome 125"', '"chrome 126"')
    expect(listIn(changed)).not.toEqual(coreFloor())
  })
})
