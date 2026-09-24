# Frozen build output — do not regenerate

The files in this directory are a snapshot of `dist/` as it was built from `tokens.json`
immediately before the DTCG 2025.10 migration. They are frozen on disk on purpose.

Tests in this package compare a live build of the current token source against these files,
byte for byte and set for set, to confirm that the migration changed only what it meant to
change and nothing else. That comparison only means anything if one side of it stays fixed:
these files ARE that fixed side, the byte-oracle the live build is checked against.

**Never regenerate this directory from a live build** (for example with something like
`pnpm build && cp dist/* test/fixtures/generated/`). Doing so replaces the pre-migration
oracle with a copy of the very output it is meant to be checked against, so the comparison
above starts comparing the migration with itself. Every one of those tests would then pass
regardless of what the migration actually did, permanently, with nothing left able to tell
the difference.

If the token source (`tokens.json`) changes later for a reason that has nothing to do with a
byte-representation migration — a new token, an updated value, anything that is not itself a
migration of this exact kind — these files do not move. They stay frozen at the pre-2025.10
build. Only a deliberate, reviewed decision to re-baseline the oracle for a new migration of
this kind should ever touch this directory.
