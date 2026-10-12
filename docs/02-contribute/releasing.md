# Releasing

How a new version of `@navecss/tokens` and `@navecss/core` gets to npm. These two packages always release together at the same version (they are a `fixed` group in `.changeset/config.json`); `@navecss/stylelint-config`, `@navecss/eslint-plugin` and `@navecss/base-ui` version independently of that pair ([ADR 0009](../04-adr/0009-release-topology.md)), and `@navecss/cli` is not published yet.

You need publish rights on both packages on npmjs.com, with two-factor authentication on your npm account.

## How it works

Nobody publishes from their own machine and no npm token exists anywhere. A GitHub Actions workflow builds the packages and **stages** them on npm: the new versions are uploaded but cannot be installed. They go live only when a maintainer **approves** each one with two-factor authentication. The workflow authenticates to npm through each package's trusted publisher, which allows staging only, so the pipeline that builds a release can never make it live on its own. npm attaches a provenance statement to every version released this way.

The staging job can only run from `main`. That is enforced twice: the workflow can be dispatched from any branch, but the job's own `if:` condition skips it unless the ref is `main`, and the job additionally runs in a `release` GitHub environment. A branch that edits the workflow can drop both of those lines, so the second guard rests on two settings kept outside this repo. The repository's `release` environment restricts its deployment branches to `main`, so GitHub refuses to run the job from any other branch while the job names the environment. Each package's npm trusted publisher names that same environment, so npm refuses a token from a run that dropped it. With both settings in place, a run from any other branch cannot stage a release at all; with only the first, a branch that edits the workflow still can. Create the environment, with its branch restriction, before the workflow first runs against it: GitHub creates a missing environment on first use with no restriction at all.

The workflow's own header comment ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) explains why each part of it is the way it is.

## 1. Version the packages

Every pull request that changes a published package adds a changeset file under `.changeset/`. When you want to release what has accumulated, on a branch off `main`:

```sh
pnpm changeset version
```

This consumes every pending changeset, bumps each package a changeset names to its new version (`tokens` and `core` always move together), and writes the new section of each bumped package's `CHANGELOG.md`. Read the changelogs, commit, open a pull request (for example `chore/version-packages`) and merge it.

`.changeset/config.json` sets `onlyUpdatePeerDependentsWhenOutOfRange` so that this step never rewrites a peer range on its own. `@navecss/stylelint-config`, `@navecss/eslint-plugin` and `@navecss/base-ui` each declare a peer range on `tokens` or `core` that states the oldest version they are known to work with, and a new release of `tokens` or `core` is not a reason to raise it. Without the option, Changesets moves that range to the new version on every release; with it, a peer range moves only when a release leaves it, for example when `core` reaches `1.0.0`. The option sits under an `experimental` key that Changesets validates loosely: if an upgrade renames or drops it, the key is ignored without an error. What catches that is the tests that pin the declared peer ranges, in `packages/stylelint-config` and `packages/eslint-plugin`. They fail on the version pull request when a range has been rewritten, so fix the range and the config key there, before merging.

This step cannot be skipped: the release refuses to run while any changeset is still pending, and fails if there is no new version to stage.

## 2. Stage the release

From the **Actions** tab, open the **release** workflow and choose **Run workflow** on `main`, or:

```sh
gh workflow run release.yml --ref main
```

The workflow rebuilds from clean, runs the packaging checks, packs each package and stages it: `@navecss/tokens` first, then `@navecss/core`. The end of its log lists what was staged and the order to approve it in. Nothing is installable yet.

It only runs on `main`: started from any other branch, the job is skipped.

## 3. Approve

Approve `@navecss/tokens` first, then `@navecss/core`. `core` depends on the matching `tokens` version, so approving it first would put a `core` release live whose dependency does not exist yet.

Approve only versions staged by a release workflow run on `main`: each run's log lists what it staged. If the queue holds a version you cannot match to such a run, do not approve it; find out where it came from first.

On npmjs.com, open each package, go to the **Staged Packages** tab, review the version and approve it with your two-factor code.

Or from a terminal, with npm 11.15.0 or newer (the first version with `npm stage`):

```sh
npm stage list @navecss/tokens
npm stage approve <stage-id>
```

## 4. Check it is live

```sh
npm view @navecss/tokens version
npm view @navecss/core version
```

Both should print the new version. On npmjs.com, each package page shows a provenance badge linking to the workflow run that built it.

## 5. Tag the release and create the GitHub Releases

A staged version is not a release until it is approved, so the workflow creates no tags and no GitHub Releases. Once both versions are live, create one GitHub Release per package, which also creates its tag. Use the commit the workflow ran on and that version's section of the package's `CHANGELOG.md` as the notes. The target must be the full 40-character sha: the workflow run's page shows only the short one, and `gh release create` refuses a short sha when the tag does not exist yet. Get the full sha from the run:

```sh
gh run view <run-id> --json headSha -q .headSha
```

or expand the short one from a clone that has fetched `main`: `git rev-parse <short-sha>`. For version `0.1.1`:

```sh
awk '/^## 0.1.1$/{found=1; next} /^## /{found=0} found' packages/tokens/CHANGELOG.md > tokens-notes.md
gh release create @navecss/tokens@0.1.1 --target <full-sha> --title "@navecss/tokens 0.1.1" --notes-file tokens-notes.md --latest=false
awk '/^## 0.1.1$/{found=1; next} /^## /{found=0} found' packages/core/CHANGELOG.md > core-notes.md
gh release create @navecss/core@0.1.1 --target <full-sha> --title "@navecss/core 0.1.1" --notes-file core-notes.md --latest
```

`@navecss/core` is marked as the latest release because it is the package most people install; the tag names match the ones Changesets uses.

## A package's first release

Trusted publishing cannot create a package: every credential-free path npm offers requires the package to already exist on the registry. Staging a release checks every publishable package's registry status before it stages anything, so a package that has never been published blocks staging the whole release, not only its own: the workflow fails before staging anything, with a message naming the package and pointing back to this section.

A new publishable package's first version goes live by hand, the same way the first version (`0.1.0`) of `@navecss/tokens` and `@navecss/core` did:

1. Merge the pull request that adds the package, as usual: with its changeset, and with the package added to `PUBLISHABLE_SET` in `scripts/check-publishable-set.mjs` (the full check fails until it is). If the package already exists in the workspace as a private package (as `@navecss/cli` does today), the same pull request also removes `"private": true` from its `package.json` and removes it from `ignore` in `.changeset/config.json`: Changesets never versions a package on that list, and the same full check fails while a publishable package is still on it.
2. Version it as in "1. Version the packages" above, and merge the version pull request.
3. From that commit, with a clean working tree, build, then pack and publish the package by hand under two-factor authentication. `dist` is not committed, so packing without building first would publish a package with nothing in it, and a published version can never be replaced:
   ```sh
   pnpm install --frozen-lockfile
   pnpm run build
   pnpm --filter <package-name> pack
   npm publish <tarball> --access public
   ```
   `pnpm pack` writes the tarball to the directory it is run from, here the repository root, and prints its path. `--access public` is needed because npm publishes a scoped package as restricted unless told otherwise. This first version carries no provenance statement, the same accepted cost `0.1.0` carried.
4. On npmjs.com, give the package the same publishing access the other packages carry: two-factor authentication required, tokens not allowed to bypass it.
5. Immediately before the run in the next step, create the package's trusted publisher on npmjs.com: repository `navecss/navecss`, workflow `release.yml`, environment `release`, staging only. Do not create it right after the hand publish. npm does not keep a trusted publisher that no publish has used: it shows the configuration as pending validation, with the deadline by which a publish must validate it (read the deadline on the page, it is not fixed here), and once that passes the configuration reads Expired and the workflow cannot authenticate with it. The run in the next step is the publish that validates it. If a configuration already reads Expired, delete it and create a new one.
6. Run the **release** workflow. It finds the version you just published already live, skips it, and stages everything else that is pending.

After that, the package releases through the flow above like every other package.

## When something goes wrong

- **"nothing to stage"**: every version is already on npm. Step 1 was skipped, or its pull request is not merged yet.
- **"is not on the npm registry yet"**: a publishable package has never been published (or is restricted and not visible to the workflow), which blocks staging every package, not only its own. See "A package's first release" above.
- **The job was skipped**: the workflow was started from a branch other than `main`.
- **A check fails in the workflow**: nothing was staged. Fix it through a normal pull request and run the workflow again.
- **`ENEEDAUTH` or "need auth" from `npm stage publish` in the workflow**: npm refused the run's credentials, so that package's trusted publisher is missing, does not match (repository `navecss/navecss`, workflow `release.yml`, environment `release`) or has expired. On npmjs.com, open the package's settings: if the trusted publisher reads Expired, delete it and create a new one; if it is missing or differs, create or correct it. Packages staged before the failure are waiting for approval: approve or reject them first (see "Staging failed partway" and the rule against running the workflow again while a version is staged), then run the workflow again. See "A package's first release" for why a new configuration expires.
- **Staging failed partway**: the log names what was already staged before the failure. Approve or reject those first, then fix the problem and run the workflow again.
- **A staged version is wrong**: reject it from the Staged Packages tab, or with `npm stage reject <stage-id>`. It never went live. Fix the problem, version again and run the workflow again.
- **Do not run the workflow again while a staged version is waiting for approval.** It checks which versions are live, not which are staged, so it would try to stage the same version a second time. Approve or reject what is pending first.
- **`HTTP 422 ... tag_name is not a valid tag ... Release.target_commitish is invalid` from `gh release create`**: the `--target` was a short sha, and the tag does not exist yet. Run it again with the full 40-character sha (step 5 shows how to get it).
- **Only one of the two packages went live**: approve the other one. If `tokens` is live and `core` is not, that is harmless for a while; the reverse is the case step 3 exists to prevent.
