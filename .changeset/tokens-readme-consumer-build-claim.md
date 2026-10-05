---
'@navecss/tokens': patch
---

The README no longer says a check run in a consumer's build "reports" its findings. The consumer build
runs one contrast check and discards its result. The sentence now says that no contrast check this
entry point runs over a consumer's values can fail the build, and that none prints or returns a
result. No behaviour changes.
