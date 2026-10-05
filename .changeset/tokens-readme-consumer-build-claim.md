---
'@navecss/tokens': patch
---

The README no longer says a check run in a consumer's build "reports" its findings. The consumer build
runs one contrast check and discards its result, so nothing is printed or returned. No contrast check
it runs can fail the build. The sentence now says exactly that, and is scoped to contrast checks this
entry point runs. No behaviour changes.
