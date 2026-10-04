---
'@navecss/tokens': patch
---

The README no longer says a check run in a consumer's build "reports" its findings. The consumer build
runs one contrast check whose result is discarded, so nothing is printed or returned, and none can
fail the build. The sentence now says exactly that, and is scoped to contrast checks this entry point
runs. No behaviour changes.
