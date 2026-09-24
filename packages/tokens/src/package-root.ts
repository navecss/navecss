/**
 * R8/R9 (this package's token-build requirements): locates THIS package's own root directory from
 * a module's `import.meta.url`, by walking up to the nearest ancestor whose `package.json`
 * DECLARES THIS PACKAGE'S OWN NAME — correct whether the caller is running from its SOURCE
 * location (`src/`, under test, one level of nesting) or its COMPILED location (`dist/lib/`,
 * R8, one level deeper), with no depth assumption baked in either way.
 *
 * The walk matches on the NAME and not merely on a `package.json`
 * existing, because "nearest ancestor carrying a `package.json`" has two failure modes that
 * both end at a directory that is not this package. (a) A `dist/package.json` or
 * `dist/lib/package.json` — the standard dual-publish `{"type":"module"}` marker, which
 * nothing here forbids a later slice from adding — is a nearer ancestor than the real root,
 * so the walk stopped one or two levels short and every read resolved under `dist/`
 * (`ENOENT` at module load, outside `bin.ts`'s `try` and so outside R4's exit-code mapping).
 * (b) Bundling `./build` into a consumer's own output relocates `import.meta.url` into THEIR
 * tree, where the nearest `package.json` is the CONSUMER's root: the walk succeeded and
 * returned a confidently wrong directory, and the consumer got a raw `ENOENT` for a path
 * inside their own project with nothing naming the cause. `attw` reports `./build` green
 * under the `bundler` resolution mode, so (b) is invited rather than hypothetical. Matching
 * on the name makes (a) walk PAST the marker to the real root, and turns (b) into a named
 * error that says what happened; neither was ever silent, and neither is now guesswork.
 *
 * Extracted after R8's compile step exposed a real, previously-latent bug: `tokens-source.ts`
 * used to compute its own package-relative path as a fixed `'../../tokens.json'` walk from
 * `import.meta.url`, which is correct only from `src/theming/` and silently resolves to
 * `dist/tokens.json` (one level short) once the same file is compiled to
 * `dist/lib/theming/`. `core-source.ts` keeps its own depth-based `path.resolve(HERE, '../..')`
 * chain unchanged and deliberately does NOT use this helper: it is only ever INVOKED from
 * `src/` by Nave's own `node build.ts` (via native type stripping), never reached from the
 * consumer-invocable path this helper exists for.
 *
 * That does NOT mean `core-source.ts` is never compiled. `tsconfig.build.json`
 * compiles the whole `src` tree with no per-file exclusion, so `core-source.ts` IS compiled
 * into `dist/lib/theming/core-source.js` and packed, carrying the identical depth-walk defect
 * this helper exists to fix (its fixed `../..` now resolves from `dist/lib/theming/`, not
 * `src/theming/`). It is inert today only because nothing on the consumer-invocable path
 * (`facade.js`, `bin.js`) imports it — `core-source.js` is one of eight compiled modules
 * unreachable from either entry point, verified by a `dist/lib` import-graph walk. Deep
 * imports into `dist/lib` are separately blocked by the package's own `exports` map
 * (`ERR_PACKAGE_PATH_NOT_EXPORTED`), so this is a bytes-and-opacity surface, not a public API
 * one, and excluding the unreachable set from the compile step is deliberately NOT done here:
 * a per-module tsconfig exclusion would need re-deriving by hand every time `src/theming`
 * gains or loses an import edge, for a surface no consumer can reach today. **`core-source.ts`
 * must therefore never be called from any reachable path without first routing it through
 * (or replacing it with) `findPackageRoot`.**
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * This package's own name, as its `package.json` declares it: the value the walk below
 * matches on, and the one thing that distinguishes this package's root from any other
 * `package.json` that happens to sit between a module and it.
 */
export const OWN_PACKAGE_NAME = '@navecss/tokens'

/**
 * True when `manifestPath` exists and declares `expectedName` as its own name. An unreadable or unparsable
 * `package.json` is treated as "not a match" and the walk continues past it, rather than
 * becoming a second failure mode of its own: a malformed manifest somewhere above this
 * package is not this function's problem to report.
 */
function isPackageNamed(manifestPath: string, expectedName: string): boolean {
  if (!existsSync(manifestPath)) return false
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown }
    return manifest.name === expectedName
  } catch {
    return false
  }
}

/**
 * Walks up from `fromUrl` to the nearest ancestor directory whose `package.json` declares
 * `expectedName`. Throws, naming the cause, when no such ancestor exists.
 */
export function findPackageRoot(fromUrl: string, expectedName = OWN_PACKAGE_NAME): string {
  let dir = path.dirname(fileURLToPath(fromUrl))
  for (;;) {
    if (isPackageNamed(path.join(dir, 'package.json'), expectedName)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `could not locate ${expectedName}'s own package.json above ${fromUrl}: this module is ` +
          `running outside its own installed directory, which happens when ${expectedName} is ` +
          `bundled into another package's output or copied out of node_modules. Its entry points ` +
          `read files from inside their own installed directory and cannot be bundled; ` +
          `import them as external instead.`,
      )
    }
    dir = parent
  }
}
