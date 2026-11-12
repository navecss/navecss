/**
 * The path operations the read of the takes writes on the text, so that `@navecss/core/collect`
 * imports no Node module, behave as `node:path`'s POSIX forms do on the paths it is given.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { baseNameOf, directoryOf, extensionOf, rootEntryOf, stemOf } from '../src/vite-path-text.ts'

const PATHS = [
  '/app/src/ui/index.ts',
  '/app/node_modules/@acme/ui/dist/index.js',
  '/app/src/ui/',
  '/app/src/ui//',
  '/index.js',
  '/',
  'index.js',
  'a/b',
  '.env',
  '/app/.env',
  '/app/..',
  '/app/a.b.c',
  '/app/a.',
  '/app/...',
  '/app/.a.b',
  '',
]

describe('the path operations written on the text match node:path on POSIX paths', () => {
  it.each(PATHS)('for %j', (file) => {
    expect(baseNameOf(file)).toBe(path.posix.basename(file))
    expect(extensionOf(file)).toBe(path.posix.extname(file))
    expect(stemOf(file)).toBe(path.posix.basename(file, path.posix.extname(file)))
    expect(directoryOf(file)).toBe(path.posix.dirname(file))
  })

  it.each(['/app', '/app/', '/app//', '/'])(
    'rootEntryOf(%j) is index.html in that root',
    (root) => {
      expect(rootEntryOf(root)).toBe(path.posix.join(root, 'index.html'))
    },
  )
})

describe('rootEntryOf on a Windows root', () => {
  it('drops the trailing backslash and joins index.html with a slash', () => {
    const root = `${String.raw`C:\proj`}\\`

    expect(rootEntryOf(root)).toBe(`${String.raw`C:\proj`}/index.html`)
  })
})
