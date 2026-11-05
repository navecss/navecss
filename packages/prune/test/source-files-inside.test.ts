import { describe, expect, it } from 'vitest'

import { isInside } from '../src/source-files.ts'

describe('AC-nextjs-used-atoms-04: whether a path lies inside a root', () => {
  it('AC-nextjs-used-atoms-04: a directory whose name merely begins with two dots is inside', () => {
    expect(isInside('/p', '/p/..x/f')).toBe(true)
    expect(isInside('/p', '/p/..')).toBe(false)
  })

  it('AC-nextjs-used-atoms-04: a path that climbs out of the root is outside', () => {
    expect(isInside('/p', '/p/../x')).toBe(false)
    expect(isInside('/p/app', '/p/x')).toBe(false)
  })

  it('AC-nextjs-used-atoms-04: the root itself and a path below it are inside', () => {
    expect(isInside('/p', '/p')).toBe(true)
    expect(isInside('/p', '/p/app/page.jsx')).toBe(true)
  })
})
