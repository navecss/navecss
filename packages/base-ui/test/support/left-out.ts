/**
 * The members of a Base UI namespace the package leaves out, each named as `<Namespace>.<member>`:
 * a function Base UI added after the floor, which the package does not re-export because an app on
 * the floor would fail to build on it. The one place the list lives; the checks that compare the
 * package's keys with Base UI's read it here.
 */
export const LEFT_OUT: readonly string[] = ['Combobox.createItems']

export const isLeftOut = (qualified: string): boolean => LEFT_OUT.includes(qualified)
