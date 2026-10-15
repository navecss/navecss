# @navecss/eslint-plugin

## 0.2.0

### Minor Changes

- 5a07842: The class-channel rule now reads a literal inside `cx.dynamic()` the way it reads one inside
  `cx()`: a string that is no atom, a `nave-` class and an array or object are reported, with the
  same remedies (an array or object gets its own explanation, since `cx.dynamic()` takes one name).
  Before, a call to `cx.dynamic('legacy-card')` passed unreported.

  It makes three more reports inside `cx.dynamic()`. A literal that names an atom is reported, with
  `cx()` as the fix, since a name written in the source is a name the build can read: a project with
  `cx.dynamic('flex')` in a `className` now gets a report, and the fix is to write `cx('flex')` (a
  call with no argument, `null`, `undefined`, `false` and `''` still pass). Every argument after a
  non-spread argument, a spread included, is reported, whatever it holds, because `cx.dynamic()` takes
  one name and ignores the rest, and the first argument written after only spreads is reported too,
  because whether it is used depends on what the spreads before it hold.
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

## 0.1.1

### Patch Changes

- 10b8e02: The class-channel rule now reads a `className` or `class` whose whole value is an inline function
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
- 32e0f4f: A relative `cxModules` entry (one that begins `./` or `../`, or is exactly `.` or `..`) now
  matches an import only when the two resolve to the same file: the entry from the working
  directory, the import from the file that writes it. Before, it also matched any import written
  the same way, and in another directory that text names another file, so `cxModules: ['./ui']`
  made the rules read a file's own `./ui` helper in another directory as Nave's `cx`.

  A `#` import (a subpath import such as `#ds`) resolves through the `package.json` nearest the
  file that writes it, so a `#` entry is matched the same way when the import resolves from that
  file: it matches only when it lands on a file one of your entries names from the working
  directory. The plugin resolves an import as Node's `require()` does, and a `#` import it cannot
  resolve still matches a `#` entry written the same way: a `#` alias set only in TypeScript's
  `paths` or in your bundler, and an import through an `imports` map that gives its target only
  under conditions `require()` does not read, such as `import` or `browser`. With such a map, a
  file whose own `#ds` names another module is still read as importing Nave's `cx`; set the target
  under `default` or `require` as well, and the import is matched by its file. Package names,
  subpaths, other aliases and absolute paths match an import written the same way, as before.

  An entry that matched only by its text now matches nothing: a relative entry written the way one
  file spells the import, which names another file or none from the working directory, and a `#`
  entry mapped only in a nested `package.json` whose map the plugin can read. With the default
  `helpers`, the class-channel rule then reads that file's `cx()` as a helper and reports each atom
  name in it. List the module by its path from the working directory (`'./src/ui/index.js'`), or by
  an alias.

## 0.1.0

### Minor Changes

- cc4c78b: Ships `@navecss/eslint-plugin`, a NaveCSS plugin for ESLint®. Four rules close the JSX escape hatches nothing checked before: `@navecss/class-channel` (a literal class in `className`/`class` must be declared or a real `cx()` atom), `@navecss/raw-reason` (a `cx.raw()` call carrying undeclared class text needs a reason comment), `@navecss/count-escapes` (off by default; feeds ESLint's own bulk-suppressions file), and `@navecss/style-values` (a literal value on a JSX `style` property the design system tokenizes).

### Patch Changes

- Updated dependencies [f616c71]
- Updated dependencies [cc4c78b]
- Updated dependencies [d88fc5c]
- Updated dependencies [f616c71]
- Updated dependencies [f616c71]
- Updated dependencies [7c49380]
  - @navecss/core@0.2.0
