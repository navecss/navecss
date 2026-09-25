# Releasing

How a new version of `@navecss/tokens` and `@navecss/core` gets to npm. These two packages always release together at the same version (they are a `fixed` group in `.changeset/config.json`); `@navecss/bridge` and `@navecss/cli` are not published yet.

You need publish rights on both packages on npmjs.com, with two-factor authentication on your npm account.

## How it works

Nobody publishes from their own machine and no npm token exists anywhere. A GitHub Actions workflow builds the packages and **stages** them on npm: the new versions are uploaded but cannot be installed. They go live only when a maintainer **approves** each one with two-factor authentication. The workflow authenticates to npm through each package's trusted publisher, which allows staging only, so the pipeline that builds a release can never make it live on its own. npm attaches a provenance statement to every version released this way.

The workflow's own header comment ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) explains why each part of it is the way it is.

## 1. Version the packages

Every pull request that changes a published package adds a changeset file under `.changeset/`. When you want to release what has accumulated, on a branch off `main`:

```sh
pnpm changeset version
```

This consumes every pending changeset, bumps both packages to the new version, and writes the new section of each package's `CHANGELOG.md`. Read the changelogs, commit, open a pull request (for example `chore/version-packages`) and merge it.

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

A staged version is not a release until it is approved, so the workflow creates no tags and no GitHub Releases. Once both versions are live, create one GitHub Release per package, which also creates its tag. Use the commit the workflow ran on (shown on the workflow run's page, and the tip of `main` if nothing merged since) and that version's section of the package's `CHANGELOG.md` as the notes. For version `0.1.1`:

```sh
awk '/^## 0.1.1$/{found=1; next} /^## /{found=0} found' packages/tokens/CHANGELOG.md > tokens-notes.md
gh release create @navecss/tokens@0.1.1 --target <commit> --title "@navecss/tokens 0.1.1" --notes-file tokens-notes.md --latest=false
awk '/^## 0.1.1$/{found=1; next} /^## /{found=0} found' packages/core/CHANGELOG.md > core-notes.md
gh release create @navecss/core@0.1.1 --target <commit> --title "@navecss/core 0.1.1" --notes-file core-notes.md --latest
```

`@navecss/core` is marked as the latest release because it is the package most people install; the tag names match the ones Changesets uses.

## When something goes wrong

- **"nothing to stage"**: every version is already on npm. Step 1 was skipped, or its pull request is not merged yet.
- **The job was skipped**: the workflow was started from a branch other than `main`.
- **A check fails in the workflow**: nothing was staged. Fix it through a normal pull request and run the workflow again.
- **A staged version is wrong**: reject it from the Staged Packages tab, or with `npm stage reject <stage-id>`. It never went live. Fix the problem, version again and run the workflow again.
- **Do not run the workflow again while a staged version is waiting for approval.** It checks which versions are live, not which are staged, so it would try to stage the same version a second time. Approve or reject what is pending first.
- **Only one of the two packages went live**: approve the other one. If `tokens` is live and `core` is not, that is harmless for a while; the reverse is the case step 3 exists to prevent.
