/**
 * The source files of the Vite plugin's coverage fixture: one uniquely named rule holding a
 * directive in each kind of stylesheet Vite compiles. Every rule is `{ @nave flex; }`, so a source
 * is covered when its rule carries `display: flex` and no `@nave` is left anywhere.
 */

/**
 * The class name of each source's rule, keyed by what the source is.
 */
export const COVERED_SOURCES = {
  'plain .css': 'plainsrc',
  'a CSS Module': 'modsrc',
  'an ?inline import': 'inlsrc',
  'a ?url import': 'urlsrc',
  'a .css reached only through @import': 'impsrc',
  'the entry of that @import': 'entrysrc',
  'Sass, a plain rule': 'scssplain',
  'Sass, inside @mixin / @include': 'scssmixin',
  'a plain Vue style block': 'vueplain',
  'a scoped Vue style block': 'vuescoped',
  'a Vue lang="scss" style block': 'vuescss',
  'a Svelte style block': 'sveltesrc',
  'a .css under node_modules': 'pkgsrc',
} as const

export const APP_FILES: Readonly<Record<string, string>> = {
  'index.html': '<!doctype html><script type="module" src="/src/main.js"></script>',
  'src/main.js': [
    "import './plain.css'",
    "import mod from './m.module.css'",
    "import inl from './inl.css?inline'",
    "import url from './u.css?url'",
    "import './imp-entry.css'",
    "import './s.scss'",
    "import Card from './Card.vue'",
    "import Note from './Card.svelte'",
    "import 'nave-fixture-pkg/index.css'",
    'console.log(mod, inl, url, Card, Note)',
  ].join('\n'),
  'src/plain.css': [
    '.plainsrc { @nave flex; }',
    '.dispfirst { display: grid; @nave flex; }',
    '.displast { @nave flex; display: grid; }',
    '',
  ].join('\n'),
  'src/m.module.css': '.modsrc { @nave flex; }\n',
  'src/inl.css': '.inlsrc { @nave flex; }\n',
  'src/u.css': '.urlsrc { @nave flex; }\n',
  'src/imp-entry.css': "@import './imported.css';\n.entrysrc { @nave flex; }\n",
  'src/imported.css': '.impsrc { @nave flex; }\n',
  'src/s.scss': [
    '// @nave flex',
    '.scssplain { @nave flex; }',
    '@mixin wrap { @nave flex; }',
    '.scssmixin { @include wrap; }',
    '',
  ].join('\n'),
  'src/Card.vue': [
    '<template><div class="vueplain vuescoped vuescss">card</div></template>',
    '<style>.vueplain { @nave flex; }</style>',
    '<style scoped>.vuescoped { @nave flex; }</style>',
    '<style lang="scss">.vuescss { @nave flex; }</style>',
    '',
  ].join('\n'),
  'src/Card.svelte':
    '<div class="sveltesrc">note</div>\n<style>.sveltesrc { @nave flex; }</style>\n',
  'node_modules/nave-fixture-pkg/package.json': JSON.stringify({
    name: 'nave-fixture-pkg',
    version: '1.0.0',
    exports: { './index.css': './index.css' },
  }),
  'node_modules/nave-fixture-pkg/index.css': '.pkgsrc { @nave flex; }\n',
}
