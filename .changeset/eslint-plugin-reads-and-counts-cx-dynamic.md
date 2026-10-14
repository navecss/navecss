---
'@navecss/eslint-plugin': minor
---

The class-channel rule now reads a literal inside `cx.dynamic()` the way it reads one inside
`cx()`: a string that is no atom, a `nave-` class and an array or object are reported, with the
same remedies (an array or object gets its own explanation, since `cx.dynamic()` takes one name).
Before, a call to `cx.dynamic('legacy-card')` passed unreported.

It makes three more reports inside `cx.dynamic()`. A literal that names an atom is reported, with
`cx()` as the fix, since a name written in the source is a name the build can read: a project with
`cx.dynamic('flex')` in a `className` now gets a report, and the fix is to write `cx('flex')` (a
call with no argument, `null`, `undefined`, `false` and `''` still pass). Every argument after the
first is reported, whatever it holds, because `cx.dynamic()` takes one name and ignores the rest.
A name built at run time (a template literal with a slot beside static text or another slot, or a
`+` chain with an operand that is not literal text) is read only to check that some atom name fits
the text written around its slots: it is reported when none does (`` `legacy-${x}` ``) and passes
otherwise (`` `text${align}` ``).

`@navecss/count-escapes` now counts every call to Nave's `cx.dynamic()`, whatever its argument
(an atom name, `null` and no argument included), inside a `className` or not, `.ts` files
included. It has its own message, which asks for no reason comment. A reference that is never
called is not counted, and `cx.raw(cx.dynamic(tone))` is one count, at the inner call. If you
hold the count in `eslint-suppressions.json`, the next run fails on a project that calls
`cx.dynamic()` until you run `eslint --suppress-rule @navecss/count-escapes` once and commit the
new number.

`cx.dynamic` is recognised in the forms `cx.raw` is: `cx.dynamic`, `cx['dynamic']`, a namespace
import's `c.cx.dynamic`, and one `const` alias (`const d = cx.dynamic` or `const { dynamic } = cx`).
The rules read the source, so they give the same verdicts whether or not the installed
`@navecss/core` has `cx.dynamic()` yet.
