/* eslint-disable max-lines -- every README literal of the release is held in this one module, as data */
/**
 * The README text feedback owes, each item held as a literal (Markdown source, no trailing newline)
 * with the UTF-8 length and the first sixteen hex digits of the sha256 that the spec's tables give
 * it. The lengths and prefixes are the spec's, not computed from the text: the test that reads
 * this module computes both from the text and compares. The texts are the reader's items
 * (6132562445, 6138966109) and the cleared sentences (6131841394, 6132543996, 6138991843,
 * 6139394551 and the findings `i696`, `70di`, `l7fy`), byte for byte.
 */
import type { Literal } from './w9-sentences.ts'

// Reader items
/**
Reader item D1: Toast setup, with the example.
 */
export const D1_TOAST_SETUP: Literal = {
  bytes: 1324,
  prefix: '86e595f81ac2280e',
  text: [
    "Toast needs one `Toast.Provider` around both the code that raises toasts and the place they appear, and you render the toasts yourself: map the `toasts` from `Toast.useToastManager()` to one `Toast.Root` each, inside `Toast.Viewport`, inside `Toast.Portal`. To raise a toast from outside React, create a manager with `Toast.createToastManager()`, pass it to the provider's `toastManager` prop and call its `add` method.",
    '',
    '```tsx',
    "'use client'",
    "import type { ReactNode } from 'react'",
    "import { Toast } from '@navecss/base-ui/toast'",
    '',
    'export const toastManager = Toast.createToastManager()',
    '',
    'function Toasts() {',
    '  const { toasts } = Toast.useToastManager()',
    '  return (',
    '    <>',
    '      {toasts.map((toast) => (',
    '        <Toast.Root key={toast.id} toast={toast}>',
    '          <Toast.Title />',
    '          <Toast.Description />',
    '          <Toast.Close>Dismiss</Toast.Close>',
    '        </Toast.Root>',
    '      ))}',
    '    </>',
    '  )',
    '}',
    '',
    'export default function ToastArea({ children }: { children: ReactNode }) {',
    '  return (',
    '    <Toast.Provider toastManager={toastManager}>',
    '      {children}',
    '      <Toast.Portal>',
    '        <Toast.Viewport>',
    '          <Toasts />',
    '        </Toast.Viewport>',
    '      </Toast.Portal>',
    '    </Toast.Provider>',
    '  )',
    '}',
    '```',
    '',
    "`toastManager.add({ title: 'Saved', description: 'Your changes were saved.' })` then raises a toast from anywhere in your app.",
  ].join('\n'),
}
/**
Reader item D1b: the manager in a client module.
 */
export const D1B_MANAGER_IN_A_CLIENT_MODULE: Literal = {
  bytes: 188,
  prefix: '69cce4fe8d66c81c',
  text: "Call `Toast.createToastManager()` in a module that starts with `'use client'`, as in the example, and import the manager from that module: every subpath of this package is a client module.",
}
/**
Reader item D3: the stylesheet paragraph, with one z-index (replaces the shipped sentence in place).
 */
export const D3_STYLESHEET_SENTENCE: Literal = {
  bytes: 154,
  prefix: 'beb89b683b6a252e',
  text: 'Every rule in it sits in `@layer components.nave` and it declares no custom property. It sets one `z-index`, on the toast area, from `--nave-layer-toast`.',
}
/**
Reader item D6: Toast.Title's element.
 */
export const D6_TOAST_TITLE_ELEMENT: Literal = {
  bytes: 70,
  prefix: '1b9744accf33a65d',
  text: '`Toast.Title` renders an `<h2>`. Pass `render` to use another element.',
}
/**
Reader item D7: Navigation Menu structure, with the example.
 */
export const D7_NAVIGATION_MENU_STRUCTURE: Literal = {
  bytes: 1659,
  prefix: '08f799e2ffd63adc',
  text: [
    "A Navigation Menu is a `NavigationMenu.List` of `NavigationMenu.Item`s, each holding either a `NavigationMenu.Trigger` with its `NavigationMenu.Content`, or a single `NavigationMenu.Link`. The open item's content appears in one `NavigationMenu.Popup`, which you render once, after the list, through `NavigationMenu.Portal` and `NavigationMenu.Positioner`, with a `NavigationMenu.Viewport` inside it.",
    '',
    '```tsx',
    "import { NavigationMenu } from '@navecss/base-ui/navigation-menu'",
    '',
    'export default function SiteNav() {',
    '  return (',
    '    <NavigationMenu.Root>',
    '      <NavigationMenu.List>',
    '        <NavigationMenu.Item>',
    '          <NavigationMenu.Trigger>',
    '            Guides',
    '            <NavigationMenu.Icon>',
    '              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">',
    '                <path d="M3 6l5 5 5-5" />',
    '              </svg>',
    '            </NavigationMenu.Icon>',
    '          </NavigationMenu.Trigger>',
    '          <NavigationMenu.Content>',
    '            <NavigationMenu.Link href="/guides/start" active>',
    '              Quick start',
    '            </NavigationMenu.Link>',
    '            <NavigationMenu.Link href="/guides/theming">Theming</NavigationMenu.Link>',
    '          </NavigationMenu.Content>',
    '        </NavigationMenu.Item>',
    '        <NavigationMenu.Item>',
    '          <NavigationMenu.Link href="/blog">Blog</NavigationMenu.Link>',
    '        </NavigationMenu.Item>',
    '      </NavigationMenu.List>',
    '      <NavigationMenu.Portal>',
    '        <NavigationMenu.Positioner>',
    '          <NavigationMenu.Popup>',
    '            <NavigationMenu.Viewport />',
    '          </NavigationMenu.Popup>',
    '        </NavigationMenu.Positioner>',
    '      </NavigationMenu.Portal>',
    '    </NavigationMenu.Root>',
    '  )',
    '}',
    '```',
  ].join('\n'),
}
/**
Reader item D7b: the icon.
 */
export const D7B_NAVIGATION_MENU_ICON: Literal = {
  bytes: 107,
  prefix: 'e2c3a298f37a4ab6',
  text: '`NavigationMenu.Icon` turns half a turn while its item is open, so put the arrow you want turned inside it.',
}
/**
Reader item D8: panel size.
 */
export const D8_NAVIGATION_MENU_SIZE: Literal = {
  bytes: 134,
  prefix: 'da05cb35bd4cbb3b',
  text: "The panel takes the size of the open item's content, and changes size at once when you move to another item: Nave does not animate it.",
}
/**
Reader item D10: Scroll Area.
 */
export const D10_SCROLL_AREA: Literal = {
  bytes: 634,
  prefix: 'bd55a764b3ae3dec',
  text: "Give `ScrollArea.Root` a height in a class of your own, with `block-size` or `max-block-size`, and its viewport fills it. Render one `ScrollArea.Scrollbar` with a `ScrollArea.Thumb` for each direction that can scroll, and a `ScrollArea.Corner` when both can: Base UI hides the browser's own scrollbars, so a direction without them shows none. Base UI does that with a `<style>` element it renders, so under a Content Security Policy pass your nonce through Base UI's `CSPProvider`. Nave gives the scrollbar and the corner the page's base surface; on a raised panel, set the panel's `background-color` on both with a class of your own.",
}
/**
Reader item D11: Meter and Progress (rewritten).
 */
export const D11_METER_AND_PROGRESS: Literal = {
  bytes: 388,
  prefix: 'eaaa59b5b1f7e8ef',
  text: "Meter and Progress draw their value as a bar inside an outlined track, in the text colour: set `color` on the `Indicator` to change it. Making the `Track` taller leaves the bar as thick as Nave draws it, centred in the track. To draw it thicker, set the `Indicator`'s `border-block-width` to half the thickness you want and its `max-block-size` to the whole of it, in a class of your own.",
}
/**
Reader item D12: Avatar (rewritten).
 */
export const D12_AVATAR: Literal = {
  bytes: 155,
  prefix: '049046e444ead01f',
  text: "`Avatar.Fallback` takes Base UI's `delay` prop, which holds the fallback back for that many milliseconds, so an image that loads quickly does not flash it.",
}
/**
Reader item D13a: variants, the new parts.
 */
export const D13A_VARIANTS: Literal = {
  bytes: 208,
  prefix: '6a3471d2ad240a14',
  text: "`Toast.Action` and `Toast.Close` take both props too. `NavigationMenu.Trigger` has a quieter look of its own and takes neither. `Avatar.Root` takes a `size` of its own: `'sm'`, `'md'` (the default) or `'lg'`.",
}
/**
Reader item D13b: what is styled, three rows (Prettier re-pads the cells).
 */
export const D13B_WHAT_IS_STYLED_ROWS: Literal = {
  bytes: 290,
  prefix: 'c81bff6f4dbbb53f',
  text: [
    '| Feedback   | `@navecss/base-ui/toast`, `@navecss/base-ui/progress`, `@navecss/base-ui/meter` |',
    '| Navigation | `@navecss/base-ui/navigation-menu`, `@navecss/base-ui/scroll-area`              |',
    '| Display    | `@navecss/base-ui/avatar`, `@navecss/base-ui/separator`                         |',
  ].join('\n'),
}
/**
Reader item D13c: not-painted phrases, with their conditions (the README carries the phrases, not this block).
 */
export const D13C_NOT_PAINTED_PHRASES: Literal = {
  bytes: 232,
  prefix: '1df4d7e50e084ae3',
  text: [
    '- always: toasts form a plain list, not a stack of cards that fans out',
    '- `q1dc` unsigned: no motion on toasts',
    '- `zmko` signed: no motion when the Navigation Menu panel closes',
    '- `zmko` unsigned: no motion on the Navigation Menu panel',
  ].join('\n'),
}
// Cleared sentences
/**
Cleared sentence T1: F6 into the toasts.
 */
export const T1_F6_INTO_THE_TOASTS: Literal = {
  bytes: 173,
  prefix: '36efa09181a6f2a7',
  text: "While a toast is open, pressing F6 moves keyboard focus to the region that holds the toasts, and Tab moves on into them. This is Base UI's behaviour; Nave's styles add none.",
}
/**
Cleared sentence T2: the toast timer.
 */
export const T2_TOAST_TIMER: Literal = {
  bytes: 377,
  prefix: '3d57bcf134da8343',
  text: 'A toast closes on its own after its `timeout`, 5000 milliseconds unless you set another on the toast or on the provider. Base UI pauses that timer while the pointer is over the toasts, while keyboard focus is in them and while the window is in the background. A toast whose `timeout` is `0` stays until it is closed, which suits a toast that carries an action the reader needs.',
}
/**
Cleared sentence T3: every toast type painted alike.
 */
export const T3_TYPES_ALIKE: Literal = {
  bytes: 111,
  prefix: '85f33dcfa69d3478',
  text: 'Nave paints every toast alike, whatever its `type`. Say what kind of message it is in its title or description.',
}
/**
Cleared sentence RM: reduced motion, the toasts' fade in (toast fade signed).
 */
export const RM_TOASTS_IN: Literal = {
  bytes: 463,
  prefix: 'fa84dec5b631e5e6',
  text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the toasts' fade, the turn of the icon in Navigation Menu triggers, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
}
/**
Cleared sentence RM: reduced motion, the toasts' fade out (toast fade unsigned).
 */
export const RM_TOASTS_OUT: Literal = {
  bytes: 445,
  prefix: '6b7d06fd1edcdfe4',
  text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the turn of the icon in Navigation Menu triggers, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
}
/**
Cleared sentence I: limited toasts hidden (limit draft signed).
 */
export const I_LIMITED_TOASTS_HIDDEN: Literal = {
  bytes: 295,
  prefix: 'e73e67361ff2550f',
  text: "When more toasts are open than the provider's `limit` (three unless you set it), Base UI keeps the oldest ones on the page but makes them inert, and Nave hides them. Each one comes back when a newer toast closes, unless its own timer runs out first, because a hidden toast's timer keeps running.",
}
/**
Cleared sentence S-L: limited toasts visible and inert (limit draft unsigned).
 */
export const S_L_LIMITED_TOASTS_VISIBLE: Literal = {
  bytes: 365,
  prefix: '8e654d39c911bf16',
  text: "When more toasts are open than the provider's `limit` (three unless you set it), Base UI keeps the oldest ones on the page but makes them inert, and Nave still shows them: they cannot be clicked, focused or read by a screen reader, and their timers keep running, so one can close without ever becoming usable. Raise `limit` if every toast you show must stay usable.",
}
/**
Cleared sentence S-P3: placement and stacking (placement signed).
 */
export const S_P3_PLACEMENT_AND_STACKING: Literal = {
  bytes: 496,
  prefix: 'c2ee024ffaf06e34',
  text: "Nave fixes the toasts to a bottom corner of the window, above Nave's dialogs and other popups, and an anchored toast, which Base UI places beside its anchor, sits at that same level. So a toast can cover part of your page, a popup or an open dialog, including the control that has keyboard focus. If your page, popups or dialogs can put controls where toasts appear, move the toasts with your own CSS, or move an anchored toast with the `side`, `align` and `sideOffset` of its `Toast.Positioner`.",
}
/**
Cleared sentence S-Pp2: a popup opened from a toast, the remedy (placement signed).
 */
export const S_PP2_POPUP_FROM_A_TOAST: Literal = {
  bytes: 229,
  prefix: 'e4bbe6ce327ee670',
  text: 'A popover, menu or tooltip opened from a toast opens under the other toasts where they overlap, unless you pass the toast viewport to its `Portal` as `container`. It then renders inside the region Base UI uses to announce toasts.',
}
/**
Cleared sentence S-U: toast area unplaced (placement unsigned and the scrim return signed).
 */
export const S_U_TOAST_AREA_UNPLACED: Literal = {
  bytes: 314,
  prefix: 'b1a85f5b9bb1e772',
  text: 'Nave does not place the toasts. Fix the toast area to a corner of the window in your own CSS and give it a `z-index` above your dialogs, such as `var(--nave-layer-toast)`: without one, a dialog opened later covers the toasts while F6 still moves keyboard focus into them, and a click on a toast can close a Dialog.',
}
/**
Cleared sentence S-A: anchored toasts not stacked (as S-U, after its remedy row).
 */
export const S_A_ANCHORED_NOT_STACKED: Literal = {
  bytes: 319,
  prefix: '859781890c4a61c8',
  text: 'Nave does not position or stack anchored toasts. Base UI places each one beside its anchor, and a dialog opened later covers it while F6 can still move keyboard focus into it, so give `Toast.Positioner` a `z-index` above your dialogs, such as `var(--nave-layer-toast)`, if anchored toasts can be open while a dialog is.',
}
/**
Cleared sentence S-T: a popup in a timed toast.
 */
export const S_T_POPUP_IN_A_TIMED_TOAST: Literal = {
  bytes: 293,
  prefix: '067dad0e005a5323',
  text: "If a toast holds a control that opens a popover, menu or other popup, give that toast a `timeout` of `0`. When keyboard focus moves into a popup rendered outside the toast area, Base UI resumes the toast's timer, so the toast can close while the popup is open, and keyboard focus is then lost.",
}
/**
Cleared sentence S-S: swipe.
 */
export const S_S_SWIPE: Literal = {
  bytes: 186,
  prefix: '62b8c5bbe35a782d',
  text: "Base UI moves a toast under the pointer while it is being swiped away, whatever Nave's styles and the reduced-motion setting say; `swipeDirection={[]}` on `Toast.Root` turns swiping off.",
}
/**
Cleared sentence S-C: current page.
 */
export const S_C_CURRENT_PAGE: Literal = {
  bytes: 239,
  prefix: '2c712a034e766f27',
  text: 'Pass `active` to the `NavigationMenu.Link` for the page the reader is on. Base UI then gives it `aria-current="page"`, which marks it as the current page for assistive technology, and Nave gives it a thicker underline than the other links.',
}
/**
Cleared sentence S-I: indeterminate Progress.
 */
export const S_I_INDETERMINATE_PROGRESS: Literal = {
  bytes: 258,
  prefix: 'fe4b0895e443ac0b',
  text: 'An indeterminate Progress (`value={null}`) shows only its empty track: Nave hides the bar, because a full bar would look like a finished task. If you restyle Progress, give the track its height, not the indicator, or an indeterminate bar will fill the track.',
}
/**
Cleared sentence S-M: Meter and Progress roles.
 */
export const S_M_METER_AND_PROGRESS_ROLES: Literal = {
  bytes: 247,
  prefix: '0f0674ac095bdb51',
  text: 'Meter and Progress look alike in Nave, but Base UI gives Meter the `meter` role and Progress the `progressbar` role, so choose by meaning: Meter for a measurement within a known range, such as storage used, and Progress for how far a task has got.',
}
/**
Cleared sentence S-Av: Avatar alt.
 */
export const S_AV_AVATAR_ALT: Literal = {
  bytes: 245,
  prefix: '22cd264da35afb2a',
  text: 'Give `Avatar.Image` an `alt` that names the person, or `alt=""` when their name is written next to it. Until the image loads, or if it fails to load, Base UI shows the fallback in its place, and a screen reader reads the fallback\'s text instead.',
}
/**
Cleared sentence S-N: Navigation Menu list.
 */
export const S_N_NAVIGATION_MENU_LIST: Literal = {
  bytes: 257,
  prefix: '4d92e706d5be7289',
  text: 'Nave removes the bullets from `NavigationMenu.List`. Safari still treats it as a list for screen readers because Base UI renders it inside a `nav` element; if you give the menu\'s root or popup another element through `render`, add `role="list"` to the list.',
}
/**
Cleared sentence S-SA: Scroll Area viewport.
 */
export const S_SA_SCROLL_AREA_VIEWPORT: Literal = {
  bytes: 214,
  prefix: 'df625ba85746fcf7',
  text: "While its content overflows, a Scroll Area's viewport is a Tab stop, so a keyboard can reach and scroll it. Nave leaves its focus ring to the browser and paints the scrollbars whenever there is something to scroll.",
}
/**
Cleared sentence S-K: keepMounted scrollbar.
 */
export const S_K_KEEP_MOUNTED_SCROLLBAR: Literal = {
  bytes: 391,
  prefix: 'd6e0fd1ba180b80a',
  text: 'If you pass `keepMounted` to a `ScrollArea.Scrollbar`, it stays on screen over the edge of the content even when there is nothing to scroll in its direction, but Nave makes room for a scrollbar only while its direction can scroll. Give the viewport that room yourself on that edge, as both `padding` and `scroll-padding`: `calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs))`.',
}
/**
Cleared sentence S-D: disabled trigger.
 */
export const S_D_DISABLED_TRIGGER: Literal = {
  bytes: 204,
  prefix: '679e98770a6b0345',
  text: 'Nave does not dim a disabled `NavigationMenu.Trigger` and only withholds its hover fill, because before Base UI 1.6 a disabled trigger still opens its menu on hover. If you disable one, style it yourself.',
}
/**
The sentence of the shipped README that D3 replaces in place, in the state where the placement is
unsigned.
 */
export const SHIPPED_STYLESHEET_SENTENCE: Literal = {
  bytes: 104,
  prefix: 'cd2060504971c12d',
  text: 'Every rule in it sits in `@layer components.nave`, it declares no custom property and sets no `z-index`.',
}
// Withdrawn: never in the README of the combined package
/**
Reader item D2 (dropped: false since the reset went).
 */
export const D2_ANCHORED_PROVIDER: Literal = {
  bytes: 344,
  prefix: 'c03f7fdfbd44cac4',
  text: "Give anchored toasts, each a `Toast.Root` inside a `Toast.Positioner` that Base UI places beside its anchor, a `Toast.Provider` of their own, as Base UI's documentation advises. While an anchored toast is open, Nave stops fixing that provider's toast area to the corner, so stacked toasts sharing the provider would move to the end of the page.",
}
/**
Reader item D5 (dropped: S-S carries it).
 */
export const D5_SWIPE: Literal = {
  bytes: 203,
  prefix: '1cd912324eda89f2',
  text: "Swiping a toast away is Base UI's: it moves the toast under the pointer itself, down or to the right unless you pass another `swipeDirection` to `Toast.Root`, and `swipeDirection={[]}` turns swiping off.",
}
/**
Reader item D9 (dropped: S-C carries it).
 */
export const D9_CURRENT_PAGE: Literal = {
  bytes: 134,
  prefix: '42881c4433f37ab5',
  text: "Pass `active` to the `NavigationMenu.Link` of the page the reader is on, and Nave draws that link's underline thicker than the others.",
}
/**
Reader item D14 (superseded by S-K).
 */
export const D14_KEEP_MOUNTED: Literal = {
  bytes: 443,
  prefix: 'b92aee124384a538',
  text: 'If you pass `keepMounted` to a `ScrollArea.Scrollbar`, it stays on screen even when there is nothing to scroll, over the edge of the content: Nave makes room for a scrollbar only while its direction can scroll. Give the viewport that room yourself in a class of your own, `padding-inline-end` for a vertical scrollbar or `padding-block-end` for a horizontal one, set to `calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs))`.',
}
/**
cleared S-K, first form (the round-2b 16px gutter; replaced by the 391 B form).
 */
export const S_K_ROUND_2B: Literal = {
  bytes: 395,
  prefix: 'e787adae4cf1304b',
  text: 'If you pass `keepMounted` to a `ScrollArea.Scrollbar`, it stays on screen over the edge of the content even when there is nothing to scroll in its direction, but Nave makes room for a scrollbar only while its direction can scroll. Give the viewport that room yourself on that edge, as both `padding` and `scroll-padding`: `calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs))`.',
}
/**
Reader item D11, round 2a.
 */
export const D11_ROUND_2A: Literal = {
  bytes: 377,
  prefix: '0b0b882924cf6a72',
  text: "Meter and Progress draw their value as a bar inside an outlined track, in the text colour: set `color` on the `Indicator` to change it. An indeterminate Progress (`value={null}`) shows its empty track, and nothing on it moves. If you restyle the bar, give the height to the `Track`, not to the `Indicator`, because Base UI sets the indicator's width only when there is a value.",
}
/**
Reader item D12, round 2a.
 */
export const D12_ROUND_2A: Literal = {
  bytes: 252,
  prefix: '467c949ade3c1b85',
  text: "`Avatar.Fallback` shows while the image loads and when it fails to load, in which case Base UI renders no `<img>` at all. Its `delay` prop, Base UI's, holds the fallback back for that many milliseconds, so an image that loads quickly does not flash it.",
}
/**
Reader item D13c, round 2a.
 */
export const D13C_ROUND_2A: Literal = {
  bytes: 167,
  prefix: 'd9e889cf1b1329e6',
  text: [
    '- always: toasts form a plain list, not a stack of cards that fans out',
    '- `zubh` unsigned: no motion on toasts',
    '- `n85k` unsigned: no motion on the Navigation Menu panel',
  ].join('\n'),
}
/**
Cleared placement sentence (308 B, false for an anchored toast).
 */
export const S_P_PLACEMENT_308: Literal = {
  bytes: 308,
  prefix: '007625a17dfaf392',
  text: "Nave fixes the toasts to a bottom corner of the window, above Nave's dialogs and other popups, so a toast can cover part of your page, a popup or an open dialog, including the control that has keyboard focus. If your page, popups or dialogs can put controls in that corner, move the toasts with your own CSS.",
}
/**
Cleared popup limitation (95 B, replaced by the remedy).
 */
export const S_PP1_POPUP_LIMITATION: Literal = {
  bytes: 95,
  prefix: '158019b508999131',
  text: 'A popover, menu or tooltip opened from a toast opens under the other toasts where they overlap.',
}
/**
Cleared zubh reduced-motion form (413 B).
 */
export const ZUBH_REDUCED_MOTION_413: Literal = {
  bytes: 413,
  prefix: 'b6321bc8c76558ff',
  text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the toasts' fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
}
/**
Cleared udfy placement sentence (212 B).
 */
export const UDFY_PLACEMENT_212: Literal = {
  bytes: 212,
  prefix: 'cf3b8d899be5df85',
  text: 'Nave fixes the toasts to a corner of the window, so a toast can cover part of your page, including the control that has keyboard focus. If your page has controls in that corner, move the toasts with your own CSS.',
}
