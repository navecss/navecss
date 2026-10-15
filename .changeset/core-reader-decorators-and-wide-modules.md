---
'@navecss/core': patch
---

The Vite plugin now reads a `cx()` call in a decorator's arguments, on a class, a class member or a
parameter (`@tracked(cx('flex'))`), so its atoms are kept instead of trimmed with no report, and a
use of `cx` there that is not a call is reported like anywhere else. A module holding a very long
array or argument list, hundreds of thousands of elements, is read like any other module; it was
refused with a report saying it was nested too deeply. Only nesting deeper than the reader's stack
is still reported that way. `readModule` from `@navecss/core/collect` reads both the same way.
