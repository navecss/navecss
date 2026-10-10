import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { getFileInfo } from 'prettier'

/**
 * `check:pack` packs each package into its own directory (`attw --pack .` writes
 * `navecss-<name>-<version>.tgz` there) and deletes the tarball when it is done. `ci:check` runs
 * it beside `lint`, whose `prettier --check .` lists every file under the repository, including
 * a file it does not know, and then reads each one. A tarball listed and deleted before it is
 * read fails the whole check with `ENOENT`. Prettier has nothing to say about a tarball, so
 * `.prettierignore` names it and Prettier never lists it.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function ignored(relativePath) {
  const info = await getFileInfo(path.join(ROOT, relativePath), {
    ignorePath: [path.join(ROOT, '.gitignore'), path.join(ROOT, '.prettierignore')],
  })
  return info.ignored
}

test('Prettier ignores the tarball check:pack leaves in a package directory', async () => {
  assert.equal(await ignored('packages/core/navecss-core-0.2.0.tgz'), true)
})

test('Prettier ignores a tarball packed in the repository root', async () => {
  assert.equal(await ignored('navecss-0.0.0.tgz'), true)
})

test('Prettier still checks a source file beside it', async () => {
  assert.equal(await ignored('packages/core/package.json'), false)
})
