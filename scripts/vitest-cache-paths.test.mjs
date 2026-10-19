import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = path.join(ROOT, 'packages')

// Vitest keeps its file-system module cache in one directory at the workspace root unless a
// config names another, and it deletes that directory whenever the lockfile has changed. Every
// package starts its tests at once, so several of them delete the same directory together and
// one fails with ENOTEMPTY. A config that names a directory of its own inside its package, a
// different one from every other config, takes the directory out of the race.
const isConfigName = (file) => /^vitest(\.[\w-]+)?\.config\.[cm]?[jt]s$/.test(file)

const configsOf = () =>
  readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(path.join(PACKAGES, entry.name))
        .filter((file) => isConfigName(file))
        .map((file) => ({ file: path.join(PACKAGES, entry.name, file), packageDir: entry.name })),
    )

const cachePathOf = async (file) => {
  const { default: config } = await import(pathToFileURL(file).href)
  return config.test?.fsModuleCachePath
}

test('every vitest config in packages/* is found', () => {
  assert.ok(
    configsOf().length >= 9,
    'fewer vitest configs than the nine this check was written for',
  )
})

test('every vitest config in packages/* sets fsModuleCachePath inside its own package', async () => {
  for (const { file, packageDir } of configsOf()) {
    const cachePath = await cachePathOf(file)
    assert.equal(
      typeof cachePath,
      'string',
      `${path.relative(ROOT, file)} sets no fsModuleCachePath`,
    )
    const relative = path.relative(path.join(PACKAGES, packageDir), path.resolve(cachePath))
    assert.ok(
      relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative),
      `${path.relative(ROOT, file)}: ${cachePath} is not inside packages/${packageDir}`,
    )
  }
})

test('no two vitest configs in packages/* share an fsModuleCachePath', async () => {
  const owners = new Map()
  for (const { file } of configsOf()) {
    const cachePath = path.resolve(await cachePathOf(file))
    const other = owners.get(cachePath)
    assert.equal(other, undefined, `${path.relative(ROOT, file)} and ${other} share ${cachePath}`)
    owners.set(cachePath, path.relative(ROOT, file))
  }
})

test('a vitest config is recognised in every spelling a config file can take', () => {
  for (const name of [
    'vitest.config.ts',
    'vitest.browser.config.ts',
    'vitest.config.mts',
    'vitest.config.cts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vitest.config.cjs',
  ]) {
    assert.ok(isConfigName(name), name)
  }
  for (const name of [
    'vitest.setup.ts',
    'vitest.config.json',
    'vite.config.ts',
    'vitest.config.tsx',
  ]) {
    assert.ok(!isConfigName(name), name)
  }
})

const testFilesOf = (directory) =>
  existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.test\.(?:ts|mjs)$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name))
    : []

test('a test that writes a vitest config of its own sets fsModuleCachePath in it', () => {
  for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const file of testFilesOf(path.join(PACKAGES, entry.name, 'test'))) {
      const text = readFileSync(file, 'utf8')
      if (!/'vitest\.config\.ts'\s*:/.test(text)) continue
      assert.ok(
        text.includes('fsModuleCachePath'),
        `${path.relative(ROOT, file)} writes a vitest config with no fsModuleCachePath`,
      )
    }
  }
})
