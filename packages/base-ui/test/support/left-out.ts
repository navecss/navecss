/**
 * The members of a Base UI namespace the package leaves out, each named as `<Namespace>.<member>`:
 * a part Base UI added after the floor, which the package does not re-export because an app on the
 * floor would fail to build on it. `Combobox.createItems` came in 1.8.0; the Menu's filtering parts
 * came in 1.9.0, as a preview. The one place the list lives; the checks that compare the package's
 * keys with Base UI's read it here.
 */
export const LEFT_OUT: readonly string[] = [
  'Combobox.createItems',
  'Menu.Clear',
  'Menu.Empty',
  'Menu.FilterProvider',
  'Menu.Input',
  'Menu.List',
  'Menu.useFilter',
]

export const isLeftOut = (qualified: string): boolean => LEFT_OUT.includes(qualified)

/**
 * Whether a name a Base UI subpath exports beside its component is the namespace of constants that
 * names a part's data attributes or CSS variables (`DialogPopupDataAttributes`,
 * `TabsIndicatorCssVariables`). Base UI 1.9.0 added them as values, and the floor has none, so the
 * package carries them as types only, through its re-export of Base UI's types, and leaves the
 * values out for the reason above.
 */
export const isLeftOutConstants = (top: string, name: string): boolean =>
  name.startsWith(top) && /(?:DataAttributes|CssVariables)$/.test(name)
