/**
 * `test/helpers/pack-core.ts`'s `tarballFilename` reads both `npm pack --json` reply shapes: an
 * array (npm 11 and earlier) and an object keyed by package name (npm 12, the release workflow's
 * pinned version). This is a unit test on the parser itself, never a real `npm pack` spawn — the
 * custom-data tests (`css-data-shape.test.ts`, `css-data-language-service.test.ts`) already cover
 * `packCoreTarball()` end to end against whatever npm major is actually installed.
 */
import { describe, expect, it } from 'vitest'

import { tarballFilename } from './helpers/pack-core.ts'

describe('tarballFilename reads both npm pack --json reply shapes', () => {
  it('reads the filename from the npm 11 array shape', () => {
    expect(tarballFilename('[{"filename":"a.tgz"}]')).toBe('a.tgz')
  })

  it('reads the filename from the npm 12 object-keyed-by-package-name shape', () => {
    expect(tarballFilename('{"@navecss/core":{"filename":"a.tgz"}}')).toBe('a.tgz')
  })

  it.each([['{}'], ['[]'], ['null'], ['{"x":null}']])(
    'throws the no-tarball-entry message on %s',
    (raw) => {
      expect(() => tarballFilename(raw)).toThrow('npm pack --json produced no tarball entry')
    },
  )

  it('throws a distinct message when the entry has no string filename', () => {
    expect(() => tarballFilename('[{}]')).toThrow(
      'npm pack --json produced a tarball entry with no filename',
    )
  })
})
