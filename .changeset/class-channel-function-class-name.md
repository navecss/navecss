---
'@navecss/eslint-plugin': patch
---

The class-channel rule now reads a `className` or `class` whose whole value is an inline function
of component state, such as `className={(state) => (state.open ? 'is-open' : '')}` on a Base UI
part. It reports the undeclared literals that function returns, reading each returned value as a
class position: both branches of a conditional, the right side of `&&`, both sides of `||` and
`??`, template and `+` static text, `cx()` arguments, and a `const` followed one hop. An
expression body is read as one value and a block body through each of its own `return`
statements, not those of a function nested inside it. Existing code that returns an undeclared
literal from such a function will now be reported; declare the class in
`settings['@navecss'].allow` or write it with `cx.raw()` and a reason. A function held in a
variable, reached through a call, or placed anywhere but the whole value (a conditional branch, a
`||` or `??` fallback) is still not read.
