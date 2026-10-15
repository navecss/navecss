# @navecss/core

## 0.4.0

### Minor Changes

- 9ec0b86: New subpath `@navecss/core/collect`: the code the Vite plugin uses to read which atoms a module
  uses (`readModule`), to print the report of the calls it cannot read (`buildReport`, with its
  `REPORT_CAUSE` sentence) and to check the plugin's options (`assertOptions`). It contains no
  parser: the caller hands it a syntax tree it parsed itself, so a build tool other than Vite can
  read modules the same way. It is public so that a package outside core can import it, and it is not
  meant for application code: an application reaches the same behaviour through `navePlugin()` from
  `@navecss/core/vite`, which behaves as before.
- 29e563f: In a build, the Vite plugin turns each `cx()` call it read into the class string the call returns,
  so the map from atom names to classes is not in your bundle. `cx('flex', 'grid')` becomes
  `"nave-flex nave-grid"`, and a call with a condition keeps its arguments where they are, with each
  atom name replaced by its class and the result joined as `cx.raw()` joins, so every argument is
  evaluated once, in the order you wrote it. A direct `cx.raw()` call becomes the same join, and a
  direct `cx.dynamic()` call a lookup in a map of the atoms in `keep` and `keepFor`. The dev server
  keeps the run-time functions, which return the same strings, and `atomic: 'all'` rewrites nothing.

  A bundle in which every use of `cx` is one of those direct calls, and no module that imports `cx`
  calls `eval` directly, holds neither the name map nor the atoms' declarations. Two forms keep the
  map, because the build cannot follow the alias: `const r = cx.raw` and `const { raw } = cx`. So
  does a package listed in `keepFor` whose calls the build cannot read, because those calls stay
  calls to the run-time `cx()`. A module that calls `eval` directly keeps its import of `cx`, and
  with it the map, whatever text it runs (`eval('1')` too), because that text can read the module's
  names and the build cannot read the text. An indirect call, `(0, eval)(text)` or
  `globalThis.eval(text)`, runs its text in the global scope, where `cx` is not visible, and does
  not keep the import. Each rewritten module returns a source map.

### Patch Changes

- 9413d53: `readModule` from `@navecss/core/collect` now reads a closed list of TypeScript forms as an author
  writes them, so a host that parses source files without stripping their types gets, for those
  forms, the verdict the stripped file gets. A type assertion around an argument or an initialiser
  (`as`, `satisfies`, the non-null `!` and the angle-bracket `<T>x`) is read as the value it wraps, a
  name written in a type position is no reference, and an `import type` binds nothing. A value under
  an assertion is still judged like any other argument, and a report line quotes the call without its
  assertions. Outside the list the reader is not promised to agree with the stripped file: an
  assertion around `cx` itself (`(cx as typeof cx)('flex')`) is refused, and a string-literal type
  such as `'nave-grid' | 'nave-block'` still collects `grid` and `block`. `readModule` takes the tree
  with no node for a pair of parentheses, as Vite's parser returns it, and throws a `TypeError` on one
  that keeps them. None of this changes what the Vite plugin reads: it reads the code after its types are gone.
- 9413d53: The Vite plugin now reads a `cx()` call in a decorator's arguments, on a class, a class member or a
  parameter (`@tracked(cx('flex'))`), so its atoms are kept instead of trimmed with no report, and a
  use of `cx` there that is not a call is reported like anywhere else. A module holding a very long
  array or argument list, hundreds of thousands of elements, is read like any other module; it was
  refused with a report saying it was nested too deeply. Only nesting deeper than the reader's stack
  is still reported that way. `readModule` from `@navecss/core/collect` reads both the same way.
- fdd79bb: The Vite dev server no longer serves the first stylesheet response with an empty set of atoms when the stylesheet is transformed before the script that imports it has finished its own transform (Vite's warm-up does this under load). A stylesheet a script imports now waits for the graph whether or not that import is registered yet; a stylesheet a page links is still answered at once. A first paint that came without its rules is fixed; builds were never affected.
- e9172bb: `cx.dynamic()` also reads its map of kept atoms when a bundler inlines it as a JSON string, as
  Next.js's `compiler.define` does. A Vite build with `navePlugin()`'s default is unchanged: the
  bundler drops the new branch. A bundle with no map (no plugin, or `atomic: 'all'`) gains the few
  bytes that read the string.
- 3187930: Importing only `cx` no longer pulls every atom's CSS declarations into your bundle. `cx()` needs a name-to-class map and nothing else, but that map was built from the declarations object, so a bundler could not drop it: a bundle that imports `cx` alone was 4.4 KB minified and is now 1.2 KB. `atomClassMap`, `toClassName` and `AtomName` are unchanged and still exported from `@navecss/core/atoms`.
- e9172bb: In the dev server, a stylesheet that the atoms in use outgrew before the page was listening for
  updates is now reloaded when the page connects, so its classes get their rules without a manual
  reload. Vite drops a stylesheet update sent while no page is connected, and a `<link>` stylesheet
  answered before the page's script was read could be left without the rules for that script's
  classes. A connection resends only a reload that no page heard.

  A stylesheet inlined in an HTML page now reloads the pages open on the dev server when the atoms in
  use outgrow it, and one inlined in a page no longer open, or served for another route, still costs
  them one reload each time the set grows. Its text is part of the HTML a page was given, so the page
  has to be reloaded to get the new rules; the reload Vite sent for it named the HTML file by its
  file-system path, which Vite's client ignores, so a class a module added later had no rule for the
  rest of the session.

- Updated dependencies [2b2399c]
  - @navecss/tokens@0.4.0

## 0.3.0

### Minor Changes

- ea55128: The `@nave` directive's resolution and placement logic now lives in a host-free core, with the
  PostCSS plugin as one adapter over it. This lays the ground for other build tools to support
  `@nave` the same way. It also changes what the PostCSS plugin accepts and what it prints, so a
  stylesheet that built before can now fail, and an error message you match on can read
  differently:

  - The directive name now matches case-insensitively on its unescaped value (`@NAVE`, `@n\61ve`
    are directives, and now expand where they used to reach your CSS unchanged; a spelling like
    `@navex` or `@nave-flex` still passes through unchanged).
  - The directive's argument list is now read as CSS component values instead of split on
    whitespace. A name glued to punctuation used to be reported as one unknown atom (`flex, block`
    as `unknown atom "flex,"`), and under `onUnknown: 'warn'` or `'ignore'` only `block` expanded.
    Now the comma itself is reported (`separate atom names with spaces`), and under those two
    modes both names expand. A comment between two names now separates them (`flex/**/block`
    expands both), where it used to make one unknown name.
  - The directive name now ends where CSS tokenization ends it, so `@nave` followed directly by
    `,`, `.` or `:` (`@nave,flex;`, `@nave.flex;`, `@nave:flex;`) is now a directive, where it used
    to reach your CSS unchanged. That character is reported (for the first, `unexpected ","`), so
    under the default `'error'` a stylesheet holding one now fails the build; under `'warn'` or
    `'ignore'` the names after it expand. Put a space after `@nave`.
  - A directive with a `{}` block (`@nave flex { color: red }`) is now reported through
    `onUnknown` instead of its block being dropped with no message, so under the default
    `'error'` a stylesheet holding one now fails the build. Write the block's declarations in the
    rule itself.
  - Under the default `'error'`, every problem in one stylesheet is now reported in one error
    instead of only the first one found: the first problem's message, then
    `N more in this stylesheet:` and one `line:column:` line for each of the others. The report
    covers one stylesheet, so a bundler that stops at the first failing file reports one file per
    build.
  - An unknown atom is now reported at the column of its name instead of the column of the `@`:
    for `@nave nope;` indented by two spaces, column 9, where it used to be column 3.
  - The unknown-atom message now suggests the nearest atom name when one is close
    (`unknown atom "flx". Did you mean "flex"?`). Only when none is close does it list the
    available atoms, on a line of their own after
    `If it is an atom of your own, pass it in the extend option.`; it used to append
    `Available: ...` to the same line every time.
  - A directive placed directly inside a group rule nested in a style rule
    (`.card { @media (...) { @nave flex; } }`) keeps its message, which now adds a sentence naming
    the `& { @nave ...; }` workaround.
  - `extend` can now be a path to a module instead of only an inline object. The plugin declares
    that file to PostCSS as a dependency of every stylesheet, so a host with a persistent build
    cache can see it and invalidate when the file changes; an object has no such visibility. The
    path is resolved from the directory the build runs in, the module's default export is the
    atoms object, and with a path the plugin is async: call `process(css).then(cb)`, not the sync
    `.css` getter. The file's atoms are validated the same way as an inline object's, but when a
    stylesheet is processed rather than when the plugin is created. See CONSUMER-ATOMS.md.
  - `@navecss/core/postcss` now also has a default export, for tools that load it that way.
  - New: `navecss-core check` (also `@navecss/core/check`), a command that scans built CSS for a
    `@nave` directive that never got resolved (for example because a build tool's PostCSS step
    was bypassed) and fails instead of shipping a page missing the declarations it needed. See
    the package README.

- fef6ecf: `@nave` now has two more routes, for hosts that run Lightning CSS directly and for projects with no
  bundler, and Nave ships its whole stylesheet as one file. Nothing that built before changes: the
  export map only grows, and `@navecss/core` gains no dependency and no new peer.

  - New `@navecss/core/lightningcss`: `navePlugin()` returns `{ expand, resolver }`. `expand(code,
filename)` expands the directives in a stylesheet's text and returns `{ code, map }` to pass to
    Lightning CSS's `transform()` as `code` and `inputSourceMap`; `resolver.read` does the same for
    each file `bundleAsync()` asks for, so a file reached through `@import` is covered. Lightning CSS
    never sees a directive, so it prints no `Unknown at rule` warning and cannot fail on a malformed
    one; Nave's own messages name the real file, line and column. The adapter imports nothing from
    `lightningcss` and declares no peer: bring your own copy, version 1.24.1 or later. Earlier
    releases can drop the message of an error a resolver throws during `bundleAsync()`, so a malformed
    directive could fail a build with an empty error, and 1.20 and 1.21 cannot parse the nested rules
    the adapter writes. It takes `extend` (an object) and `onUnknown`, as the other plugins do. It is
    for a host that runs Lightning CSS itself, not for Vite: on Vite, keep using the Vite plugin.
  - New `navecss-core expand --source=<file> --out=<file>`, with `--extend=<module>` and `--watch`:
    expands every `@nave` in each source and writes it, reporting every problem across every file in
    one run. `--source` and `--out` repeat as pairs, matched by order. Exit `0` when every file was
    written; `1` when a stylesheet had a problem, and then nothing is written; `2` when the run could
    not be done as asked: a usage error, an `--extend` module that could not be used, a source that
    could not be read, or an output that could not be written (files written before it stay
    written). It does not resolve or inline `@import`; an import of a package
    (`@import url('@navecss/core')`) is reported as an error, because a browser cannot load it.
  - New `@navecss/core/standalone`, the file `dist/standalone.css`: the layer order statement, then
    the token layer, the reset and the atoms, each in its own layer as before, with no `@import` in
    it. A page with no bundler links it instead of importing Nave from its CSS, by path or from a CDN,
    before the stylesheet `navecss-core expand` wrote. Both names are fixed from this release: a
    `link` element pointing into `node_modules` bypasses `exports`, so the file path is as much part of
    the public surface as the subpath.
  - `@navecss/core/lightningcss` also has a default export, as the PostCSS and Vite plugins do. The named
    `navePlugin` is the documented form.

  See "Without a bundler" in the repository README and the Lightning CSS adapter and `navecss-core
expand` sections of the package README.

- 304eee4: New: `@navecss/core/vite`, a Vite plugin for the `@nave` directive. Add `navePlugin()` from it to
  `plugins`, with the same `extend` and `onUnknown` options as the PostCSS plugin. It returns two Vite plugins in
  an array, which `plugins` takes as one entry. It has no dependency and no peer, it needs no PostCSS,
  and it adds no code to the browser bundle. It expands `@nave` after Vite's own CSS step has run, so a stylesheet reached only through
  `@import`, a Sass file (a `@mixin` that holds a directive included), a CSS Module, an `?inline` or
  `?url` import, and a Vue or Svelte style block are all covered, in `vite build` and in the dev
  server, under either `css.transformer`. Under `css.transformer: 'lightningcss'` it also drops
  Lightning CSS's `Unknown at rule: @nave` warning, and only that warning, by wrapping the logger
  Vite resolved.

  The build is checked at its end. The plugin reads the CSS files the build wrote and fails the build
  if a `@nave` directive is left in one, printing the lines `navecss-core check` prints for the same
  content. There is no option to turn that off. The dev server serves no bundle, so dev has no scan;
  CSS that ends inside a JavaScript string (`?inline`), files copied from `public/`, and a CSS file
  another plugin adds after the scan (from a post-ordered `generateBundle` in a plugin listed after
  `navePlugin()`, or from `writeBundle`) are not scanned.

  Passing `extend` as a path to a module now works with Vite's own watching: edit the module and the
  dev server serves the new value with no restart, and `vite build --watch` rebuilds.

  To migrate a project that already runs the PostCSS plugin on Vite: move `navePlugin()` from
  `css.postcss` or `postcss.config.js` to `plugins`, importing it from `@navecss/core/vite`. Leaving
  both is harmless, because whichever pass runs second finds no directive left. Moving also changes
  which atoms ship, as another entry in this release describes. Webpack and any other pipeline that
  runs PostCSS plugins keep using `@navecss/core/postcss`, and so can Next.js. The plugin sets no browser
  floor of its own: `build.cssTarget` (and, under Lightning CSS, `css.lightningcss.targets`) stay
  yours, and the package README shows both at the floor.

  `@navecss/core/vite` also has a default export, for tools that load it that way.

- 1e83194: The Vite plugin ships only the atoms its build can read a use for, in the CSS files of a client
  build. `navePlugin()` from `@navecss/core/vite` reads the `cx()` calls in the code the build
  compiles, dependencies included, and in those files the atom layer keeps the rules for the atoms the
  calls name, for the atom of each Nave class written as text (in a module or in `index.html`) and for
  the atoms in `keep` and `keepFor`. It keeps no others, with two exceptions: `srOnlyFocusable` is
  kept whenever `srOnly` is, and the client build also keeps the atoms that a separate server build
  (`vite build --ssr`) recorded in the cache directory. A stylesheet imported with `?inline` or `?raw`
  becomes text in the JavaScript, which the plugin does not filter: if it holds the atom layer, every
  atom in it ships and the client build warns, naming the file. A `cx()` call whose atoms the build
  cannot read fails the build: `vite build` lists every such use once, at the end, naming the file
  each one is in, then says how to fix them. A Nave class built from pieces (`'nave-' + tone`) fails
  the build the same way. The PostCSS plugin ships every atom, on Next.js and webpack alike.

  The dev server serves the same set as far as it has read: it filters the atom layer of each
  stylesheet as the build does, from the code and the pages it has read so far, so a class the build
  cannot see has no rule in dev either. The first stylesheet response waits until every module
  reachable from the page's entries has been read, and the stylesheet reloads when an edit adds an
  atom. A build or dev server that read no use and no markup (a backend rendering its own templates)
  warns once.

  New: `cx.dynamic(name)` on `@navecss/core/cx`, for a name known only at run time. In the dev server
  and in code that `vite build` bundles under the Vite plugin, it returns a class only for an atom
  listed in `keep` or in a `keepFor` list, unless `atomic` is `'all'`; in dev a name outside the list
  also prints a line to the console. Under `atomic: 'all'`, and without the plugin, it
  maps like `cx()`, except that a name that is no atom returns `''` where `cx()` returns it
  unchanged.

  New Vite plugin options: `keep`, the atoms always shipped; `keepFor`, by package name, the atoms a
  dependency's own calls can produce, for a package whose calls the build cannot read; `cxModules`,
  the modules that re-export `cx` from `@navecss/core/cx`, in your code or in a dependency, so a file
  that imports `cx` from one is read as if it imported it from `@navecss/core/cx` (the same setting
  as `@navecss/eslint-plugin`'s); and `atomic: 'all'`, which reads no `cx()` call and ships every
  atom.

  Unless `atomic` is `'all'`, the plugin also sets two Vite options for `@navecss/core` itself: it
  adds it to `optimizeDeps.exclude`, so the dev server can read your dependencies' `cx()` calls, and
  to every server environment's `resolve.noExternal`, so `cx.dynamic()` resolves through `keep` and
  `keepFor` in a server build too.

  A file of yours that imports a module listed in `cxModules` through a specifier the build does not
  recognise fails `vite build`, which names the file and says how to fix it.

### Patch Changes

- 2cfc317: The `LICENSE` shipped in the `@navecss/core` package now credits the material its directive tokenizer takes from CSS Syntax Level 3 and the material its source-map encoder takes from ECMA-426 (the source map format specification) and RFC 4648 (the base64 alphabet). Only the licence text changes; no code or behaviour does.
- 304eee4: The PostCSS plugin (`@navecss/core/postcss`) now refuses three kinds of `extend` value it did not
  check in 0.2.0, so an `extend` map that built on 0.2.0 can now fail the build, with an error naming
  the atom. `extend` is trusted, consumer-authored config, not sanitised input: these are correctness
  fixes, closing three ways a value reached the CSS without being checked. If your build now fails
  here, write the value the error names as a plain object (`{ ... }`).

  - A `pseudos`, `media` or `container` value that is a function, an array, a non-empty string, a
    non-zero number, `true` or a boxed primitive such as `new String('x')`, or a declarations map
    inside one that is any of these, is now refused; a falsy one is skipped and emits nothing. 0.2.0
    did not check them: `pseudos: { ':hover': ['a; } body { display: none'] }` emitted
    `body { display: none }` outside the rule, a string or a `String` object where a declarations
    map belongs emitted one numbered declaration per character (`0: a; 1: b`), and a `media` or
    `container` value that was itself a string or an array was dropped with no message. It skipped
    most falsy values too, but `false`, `0` or `''` as a pseudo's declarations emitted an empty rule
    (`&:hover {}`), and `null` or `undefined` there, or as a `media` or `container` block, failed
    the build with a `TypeError` naming neither Nave nor the atom.
  - An atom that is a function, an array, a non-empty string, a non-zero number, `true` or a boxed
    primitive such as `new String('x')` is now refused, even if no `@nave` directive uses it. 0.2.0
    built with such an atom as long as no directive used it. A directive that used an array, a
    non-empty string, a non-zero number, `true` or a boxed primitive failed the build, whatever
    `onUnknown` said, and a function with a `declarations` property was accepted: its
    `declarations` were read once to check them and again to write them, so a value that changed
    between the two reads reached the CSS unchecked. A falsy atom (`false`, `0`, `''`, `null`,
    `undefined`) is unchanged: it is skipped, and a directive that uses it reports an unknown atom
    through `onUnknown`, so `brandBox: isBrand && { declarations: { ... } }` keeps working.
  - An atom's own `declarations` that is a function, an array, a non-empty string, a non-zero
    number, `true` or a boxed primitive is now refused too, even if no `@nave` directive uses the
    atom. 0.2.0 built with it as long as no directive used the atom, and a directive that used it
    failed the build, except that a `String` object emitted one numbered declaration per character
    (`0: a; 1: b`) and any other boxed primitive added nothing. A missing or falsy `declarations` is
    unchanged: it fails the build only at a directive that uses the atom.

- 1d89ba5: The `focusRing` atom now draws a ring on keyboard focus even when its focus tokens are missing. It used to restore its outline with a single `outline` shorthand that read `--nave-border-width-focus` and `--nave-color-border-focus` without fallbacks, so when the token stylesheet did not load, or when your own token layer (`@navecss/core/no-tokens`) left those properties out, the shorthand was invalid as a whole and computed to `none`: the default outline was removed and nothing replaced it. A value of the wrong type in one of them could do the same. The ring is now `outline-style: solid` with separate `outline-width` and `outline-color` declarations, which fall back to `2px` and the element's own text colour (`currentColor`) when the properties are not defined. A value of the wrong type now affects only the declaration that reads it, so the ring still draws. With valid tokens, the ring is the same as before. The `@navecss/core/no-tokens` header comment no longer cites the focus outline as its example of a lost property.
- 526c829: `@navecss/core/postcss` now loads through `require()` as well as `import`, so a CommonJS `postcss.config.js` can use the plugin. It also loads when a host reads the plugin by its package name, which is the form Next.js's webpack pipeline accepts: `plugins: { '@navecss/core/postcss': {} }`. Before, both failed (`ERR_PACKAGE_PATH_NOT_EXPORTED`, or `An unknown PostCSS plugin was provided`), so the README's PostCSS setup did not work for Next.js on webpack. `require('@navecss/core/postcss')` returns the plugin function itself and is the same function `import` gives you, with its own CommonJS type declarations. `@navecss/core/cx` and `@navecss/core/atoms` still load through `import` only. The README now has the Next.js setup and its browser floor.
- Updated dependencies [7eb53f5]
- Updated dependencies [5f01e71]
- Updated dependencies [fef6ecf]
  - @navecss/tokens@0.3.0

## 0.2.0

### Minor Changes

- d88fc5c: This release refuses some input that 0.1.1 accepted, so an `extend` map or a DTCG source that built on 0.1.1 can now fail the build. Before upgrading, check yours for the shapes listed below.

  `@navecss/core`: `navePlugin({ extend })` now validates your atoms when the plugin is created; 0.1.1 did not check their CSS strings at all and emitted them as written. Every declaration, pseudo selector key and `media`/`container` condition in an `extend` atom must parse as exactly that one CSS construct, or the build fails with an error naming the atom, even if no `@nave` directive uses it. Newly refused: a value that ends its declaration or rule and starts another (`red; background: blue`), a value ending in `;`, and a value carrying a CSS comment, even a closed one (`red /* note */`). Still accepted: a `;`, `{` or `/*` inside a string or a `url()`, leading or trailing whitespace, and `!important`. A comment in a pseudo selector key is accepted and now read as a comment: 0.1.1 took an `&` inside one (`/* note & */:hover`) as the key's anchor, so it matched a descendant instead of the same element, and split the key at a comma inside a comment.

  `@navecss/tokens`: the DTCG reader (`navecss-tokens build`, and `build()` from `@navecss/tokens/build`) now refuses these source shapes, all accepted by 0.1.1, with an error naming the token:

  - A key starting with `$` other than the metadata keys (`$value`, `$type`, `$description`, `$extensions`, `$deprecated`, `$ref`). 0.1.1 skipped it along with everything under it. `$root` and `$extends` (DTCG 2025.10 §6.2, §6.4) are named as not supported yet, with how to convert them.
  - A key containing a `.`, which a DTCG 2025.10 name may not contain (§5.1.1). A lone one used to build; one that coincides with a nested path (`"b.c"` in `a`, and `c` in `a.b`) could not be told apart from it.
  - A token that also has child tokens. 0.1.1 dropped the children.
  - A raw string value containing `;` or `/*`. 0.1.1 wrote it into the generated CSS as is.
  - An alias chain longer than 1000 links. 0.1.1 overflowed the call stack.

  Also in `@navecss/tokens`:

  - `build --out` pointing at an existing file (or a similar path conflict), and a broken install (the package's own built manifest missing), now exit 2 with a message naming the problem instead of 1 with a raw filesystem error; `build()` and `validate()` reject with the exported `UsageError`. Other write failures still surface as themselves.
  - A CLI flag given twice is now refused instead of silently using the last value.
  - In the generated CSS, the `layer` (stacking-order) tokens register as `<integer>` instead of `<number>`, so a fractional override can no longer produce an invalid `z-index`, and the neutral ramp pins its alpha to `1`, so a semi-transparent `--nave-color-tint` no longer makes every neutral surface semi-transparent.

- f616c71: Ships `skills/navecss/SKILL.md`, an Agent Skills guide generated from the atom source and the resolved token/palette data: every built-in atom with its declarations and variants, every `--nave-*` custom property with its description where one exists, the `@layer` order, and the `@nave`/`cx()`/`cx.raw()` idiom. No coding agent discovers a file under `node_modules` on its own, so reach it through a pointer block in your project's `AGENTS.md` (documented in a later change) rather than expecting it to load automatically.
- 7c49380: Ships `nave.css-data.json`, a CSS custom-data file generated from the atom source that declares the `@nave` at-rule to VS Code's CSS language service. Point `css.customData` at it and the editor stops reporting `@nave` as an unknown at-rule, still catches a misspelt one, and on hover describes `@nave` and lists the built-in atom names by section. The file adds no atom-name suggestions as you type. `ATOMS.md`'s Variants column now also renders each pseudo-class, `@media` and `@container` variant's own declarations beside its selector, rather than the selector alone.

### Patch Changes

- f616c71: `ATOMS.md` now shows `disabledState`'s aria-disabled note in the atom's own row, beside the declarations it applies to.
- cc4c78b: Updates the `cx()` documentation (the README's "Escape hatch" section and `cx.ts`'s own docblock) to name `@navecss/eslint-plugin`, which now checks the rest of the `className` attribute — a bare string sitting beside `cx()`/`cx.raw()` is no longer unchecked once that plugin is installed. No runtime behaviour changes.
- f616c71: The README's layer-order paragraph now says that `!important` reverses the order, so an `!important` in `overrides` does not beat Nave's own layers.
- Updated dependencies [314680e]
- Updated dependencies [d88fc5c]
- Updated dependencies [9695371]
  - @navecss/tokens@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [180a423]
  - @navecss/tokens@0.1.1
