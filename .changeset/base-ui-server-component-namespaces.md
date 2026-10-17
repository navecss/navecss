---
'@navecss/base-ui': patch
---

A Server Component can use a namespace such as `Dialog` again.

0.2.0 put `'use client'` on each subpath's entry module as well as on its parts module, so
`import { Dialog } from '@navecss/base-ui/dialog'` made `Dialog` itself one client reference, and a
Next.js App Router page without a directive that rendered `<Dialog.Root>` failed `next build` under
both Turbopack and webpack. The 27 subpaths that export a namespace were affected. The directive now
sits on the parts modules only, as it does in Base UI, and on none of the entry modules or the
package root, so the prefix swap works in a Server Component as it does in a client one.
