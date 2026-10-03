---
'@navecss/eslint-plugin': patch
---

The class-channel rule now reads a `className` or `class` that is an inline function of component
state, such as `className={(state) => (state.open ? 'is-open' : '')}` on a Base UI part. It reports the
undeclared literals that function returns, with the same grammar it applies to any other class
value (both branches of a conditional, `&&` and `||`, template and `+` static text, `cx()`
arguments, a `const` followed one hop). An expression body is read as one value and a block body
through each of its own `return` statements, not those of a function nested inside it. Existing
code that returns an undeclared literal from such a function will now be reported; declare the
class in `settings['@navecss'].allow` or write it with `cx.raw()` and a reason. A function held in
a variable, or reached through a call, is still not read.
