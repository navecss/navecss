import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * pnpm runs every `package.json` script through `/bin/sh`, which has no globstar: it treats `**`
 * exactly like `*`, one directory level only. A script that writes `src/**\/*.css` unquoted is
 * therefore not asking Stylelint to recurse — it is asking `/bin/sh` to expand the pattern first,
 * and `/bin/sh` hands Stylelint whatever literally matches one directory of nesting under `src`.
 * Once any CSS file exists in a `src/` subdirectory, every top-level `src` CSS file silently
 * drops out of the lint run, and the command still exits 0.
 *
 * The fix is to quote the pattern (`"src/**\/*.css"`) so the shell passes it through untouched and
 * Stylelint's own glob engine — which does understand globstar — expands it instead. This test
 * reads every package's real `scripts` block and fails if any script argument still contains an
 * unquoted `**`, so the failure mode above cannot silently return once it is fixed.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function packageJsonPaths() {
  const paths = [path.join(ROOT, 'package.json')]
  const packagesDir = path.join(ROOT, 'packages')
  for (const entry of readdirSync(packagesDir)) {
    const packageJsonPath = path.join(packagesDir, entry, 'package.json')
    if (statSync(packageJsonPath, { throwIfNoEntry: false })?.isFile()) {
      paths.push(packageJsonPath)
    }
  }
  return paths
}

// A whitespace split is enough here: no script in this repository puts a space inside a quoted
// argument, so it never has to reconstruct shell tokenization to tell real args apart.
function findUnquotedDoubleStarArgs(command) {
  return command
    .split(/\s+/)
    .filter((arg) => arg.includes('**'))
    .filter((arg) => !(arg.startsWith('"') && arg.endsWith('"') && arg.length > 1))
}

test('no package.json script passes an unquoted ** glob to /bin/sh', () => {
  const violations = []

  for (const packageJsonPath of packageJsonPaths()) {
    const { scripts } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    if (!scripts) continue

    for (const [scriptName, command] of Object.entries(scripts)) {
      for (const arg of findUnquotedDoubleStarArgs(command)) {
        violations.push(
          `${path.relative(ROOT, packageJsonPath)} script "${scriptName}" passes the ` +
            `unquoted argument "${arg}" — /bin/sh expands ** as * (one directory level, no ` +
            'recursion), so wrap it in double quotes and let the CLI expand its own glob.',
        )
      }
    }
  }

  assert.deepEqual(violations, [])
})
