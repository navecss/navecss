# @navecss/eslint-plugin

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
