# Consumer atoms

Nave's built-in atoms ([ATOMS.md](./ATOMS.md)) are a small set of universal utilities.
Your design system will accumulate patterns specific to your brand —
interactive behaviors, component conventions, responsive rules — that
don't belong in Nave's core but should be reusable across your codebase.

Consumer atoms are the answer. They extend the @nave directive with your
own vocabulary, follow the same AtomDefinition shape, and grow with your system.

## Defining consumer atoms

The example below imports from `@navecss/tokens`, so add it as a direct dependency
of your own (`pnpm add -D @navecss/tokens`). Installed only as a dependency of
`@navecss/core`, it may not be importable from your own config: under pnpm it is
not.

```ts
// src/design-system/atoms.ts
import type { AtomDefinition } from '@navecss/core/postcss'
import { media } from '@navecss/tokens/breakpoints'

export const myAtoms: Record<string, AtomDefinition> = {
  primaryButton: {
    declarations: {
      background: 'var(--nave-color-action-primary)',
      color: 'var(--nave-color-on-action-primary)',
      padding: 'var(--nave-spacing-control-md) var(--nave-spacing-control-lg)',
      'border-radius': 'var(--nave-radius-control)',
      'font-weight': 'var(--nave-font-weight-medium)',
    },
    pseudos: {
      ':hover': {
        background: 'var(--nave-color-action-primary-hover)',
      },
      ':active': {
        background: 'var(--nave-color-action-primary-active)',
      },
    },
    media: {
      // Always use media strings from @navecss/tokens/breakpoints.
      // Never write breakpoint values as magic numbers.
      [media.phoneOnly]: {
        declarations: { width: '100%' },
      },
    },
  },
}
```

## Registering with the plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/postcss'
import { myAtoms } from './src/design-system/atoms'

export default defineConfig({
  // your existing options, plugins included, stay as they are
  css: { postcss: { plugins: [navePlugin({ extend: myAtoms })] } },
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
})
```

`build.cssTarget` is the browser floor, in Vite's terms:
[PostCSS plugin setup](./README.md#postcss-plugin-setup) says what goes wrong
without it.

## Using consumer atoms

Like the rest of your component CSS, the rule goes in `@layer components.consumer`,
and the directive expands inside it:

```css
/* button.module.css */
@layer components.consumer {
  .root {
    @nave interactive focusRing transition primaryButton;
  }
}
```

Compiles to:

```css
@layer components.consumer {
  .root {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    transition-property: color, background-color, border-color, opacity, box-shadow;
    transition-duration: var(--nave-motion-duration-base);
    transition-timing-function: var(--nave-motion-easing-standard);
    background: var(--nave-color-action-primary);
    color: var(--nave-color-on-action-primary);
    padding: var(--nave-spacing-control-md) var(--nave-spacing-control-lg);
    border-radius: var(--nave-radius-control);
    font-weight: var(--nave-font-weight-medium);
    &:focus-visible {
      outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);
      outline-offset: 2px;
    }
    &:hover {
      background: var(--nave-color-action-primary-hover);
    }
    &:active {
      background: var(--nave-color-action-primary-active);
    }
    @media (width < 37.5em) {
      & {
        width: 100%;
      }
    }
  }
}
```

## Rules and conventions

**Always use media strings from @navecss/tokens/breakpoints.**
Never write breakpoint values as magic numbers.
One source of truth — the token file — for every breakpoint in your system.

**Consumer atoms win on name collision with Nave atoms.**
Your system owns its vocabulary. If you need to override a Nave atom's
behaviour, name your atom the same key. Use this power deliberately.

**Consumer atoms are @nave-directive only.**
They do not generate global CSS classes and are not available in cx().
cx() is for Nave's built-in atoms: passing a name that is not one of them
is a TypeScript error rather than the silent pass-through it used to be.
The exception is a key you deliberately collided with a built-in (above):
cx() still accepts it and still returns the BUILT-IN atom's global class,
never your override, so compose that one with @nave in the rule body.

**A `pseudos` key compounds onto the element, not a descendant of it.**
`':hover'` compiles to `&:hover`, matching the element
itself. A key can also be a comma-separated selector list
(`':disabled, [aria-disabled="true"]'`), and every branch is anchored with
`&` automatically, so each branch still matches the element itself rather
than a descendant of it. A branch that already contains `&`
(`'&[aria-disabled="true"]'`, or an author-written relative branch like
`'.foo &'`) is left exactly as authored, since it is already relative to the
parent selector by construction. One deliberate consequence: **leading
whitespace in a key is not honoured as a descendant combinator.** `' .icon'`
still compounds onto the element (`&.icon`, once trimmed), it does not
select a `.icon` descendant — write a real descendant rule directly in your
CSS Module if that is what you need, not as a `pseudos` key.

**Curate your atoms.ts deliberately.**
Over time this file becomes the precise record of every reusable interactive
pattern in your design system. New team members read it to understand the
system's conventions. Designers reference atom names in handoff. Treat it
with the same care as your tokens.json.

**Mobile-first always.**
Follow the same convention as Nave's built-in responsive atoms.
Start from the smallest context and expand upward.
The only legitimate max-width query is phoneOnly.

## Container queries

Container queries let components respond to their container's available space
rather than the viewport. This is the correct tool for component-level
responsiveness — use media queries for page-level layout decisions.

### Establishing a containment context

Apply the built-in `container` atom to any wrapper element whose children
should use `@container` queries:

```css
/* card-wrapper.module.css */
@layer components.consumer {
  .wrapper {
    @nave container;
  }
}
```

```tsx
<div className={styles.wrapper}>
  <Card />
</div>
```

### Consumer atoms with container queries

Define component-specific container behavior in your consumer atoms.
Container thresholds are component-specific — there is no universal
"compact" width. Choose thresholds that match your component's content.

```ts
// src/design-system/atoms.ts
import type { AtomDefinition } from '@navecss/core/postcss'

export const myAtoms: Record<string, AtomDefinition> = {
  adaptiveCard: {
    // Default: stacked layout (mobile-first, smallest context)
    declarations: {
      display: 'flex',
      'flex-direction': 'column',
      gap: 'var(--nave-spacing-content-md)',
    },
    // When container has room: switch to horizontal
    container: {
      '(width >= 28rem)': {
        declarations: {
          'flex-direction': 'row',
          'align-items': 'center',
        },
      },
    },
  },

  compactDataRow: {
    declarations: {
      display: 'grid',
      'grid-template-columns': '1fr',
      gap: 'var(--nave-spacing-content-sm)',
    },
    container: {
      '(width >= 40rem)': {
        declarations: {
          'grid-template-columns': 'repeat(3, 1fr)',
        },
      },
      '(width >= 60rem)': {
        declarations: {
          'grid-template-columns': 'repeat(5, 1fr)',
        },
      },
    },
  },
}
```

### Usage

```css
/* card.module.css */
@layer components.consumer {
  .root {
    @nave adaptiveCard;
    background: var(--nave-color-surface-raised);
    border-radius: var(--nave-radius-card);
    padding: var(--nave-spacing-content-md);
  }
}
```

Compiles to:

```css
@layer components.consumer {
  .root {
    display: flex;
    flex-direction: column;
    gap: var(--nave-spacing-content-md);
    background: var(--nave-color-surface-raised);
    border-radius: var(--nave-radius-card);
    padding: var(--nave-spacing-content-md);
    @container (width >= 28rem) {
      & {
        flex-direction: row;
        align-items: center;
      }
    }
  }
}
```

### Container query units

Inside a `@container` block, you can use container query length units
(`cqi`, `cqb`, `cqw`, `cqh`) to size elements relative to the container.
These are not atom concerns — use them directly in your CSS Module declarations.

```css
@layer components.consumer {
  .title {
    font-size: clamp(var(--nave-font-size-md), 4cqi, var(--nave-font-size-2xl));
  }
}
```

### Named containers

If you need to query a specific ancestor by name rather than the nearest
containment ancestor, define it directly in your CSS Module. The container
shorthand requires a name string that cannot be expressed as a static atom:

```css
/* layout.module.css */
@layer components.consumer {
  .sidebar {
    container: sidebar / inline-size;
  }
}

/* widget.module.css — targets the named sidebar container specifically */
@layer components.consumer {
  .root {
    /* base styles */
  }

  /* This rule cannot be expressed as a consumer atom: write it directly */
  @container sidebar (width < 20rem) {
    .root {
      display: none;
    }
  }
}
```

### Media queries vs container queries — when to use which

| Concern                                           | Use                               |
| ------------------------------------------------- | --------------------------------- |
| Page skeleton — columns appearing, nav collapsing | `@media` + breakpoint atoms       |
| User preference — dark mode, reduced motion       | `@media`                          |
| Component layout — card stacking, grid reflow     | `@container` + consumer atoms     |
| Typography scaling relative to container          | `@container` + cqi units          |
| Sidebar-aware component behavior                  | `@container` with named container |

The clearest rule: if the component would behave differently in a sidebar
vs in a main column at the same viewport width, use a container query.
If the component always behaves the same way regardless of where it sits,
use a media query.
