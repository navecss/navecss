/**
 * Listing a rendered document the way the wrapper-against-bare comparison needs it: every element
 * in tree order with its attributes, `id` values replaced by their first-appearance ordinal and
 * every attribute that refers to one mapped through the same table (so the ids React generates,
 * which differ between two renders and between React majors, never show up as a difference).
 */
/**
The ids `useId` generates: `_r_1a_` on React 19, `:r1a:` on React 18.
 */
const GENERATED_ID = /^(?:_r_[\da-z]+_|:r[\da-z]+:)$/

export interface ElementRecord {
  readonly attributes: ReadonlyMap<string, string>
  readonly tag: string
}

const elementsOf = (root: ParentNode): Element[] => [...root.querySelectorAll('*')]

/**
Every element under `root` (the document body by default), in tree order.
 */
export const describeDocument = (root: ParentNode = document.body): ElementRecord[] => {
  const elements = elementsOf(root)
  const ordinals = new Map<string, string>()
  for (const element of elements) {
    const id = element.getAttribute('id')
    if (id !== null && !ordinals.has(id)) {
      ordinals.set(id, `#${ordinals.size + 1}`)
    }
  }
  const canonical = (token: string): string => {
    if (!ordinals.has(token) && GENERATED_ID.test(token)) {
      // An id React generated that no element carries (Base UI's `data-rootownerid` names one).
      ordinals.set(token, `#${ordinals.size + 1}`)
    }
    return ordinals.get(token) ?? token
  }
  // Every attribute is read as a list of tokens, so the IDREF attributes (`aria-labelledby`,
  // `aria-describedby`, `aria-controls`, `aria-owns`, `for`) and the ones Base UI adds
  // (`data-rootownerid`) all map through the table; only a token that is an id in this
  // document changes, and a class name never is.
  return elements.map((element) => ({
    attributes: new Map(
      [...element.attributes].map(({ name, value }) => [
        name,
        name === 'class' ? value : value.split(/\s+/).map(canonical).join(' '),
      ]),
    ),
    tag: element.tagName.toLowerCase(),
  }))
}

const isOwnAttribute = (name: string): boolean => name === 'class' || name.startsWith('data-nave-')

/**
Where two listings differ in anything but the class and the `data-nave-*` attributes: an empty
list when the wrapper rendered exactly the bare part's document.
 */
export const parityViolations = (
  bare: readonly ElementRecord[],
  wrapped: readonly ElementRecord[],
): string[] => {
  if (bare.length !== wrapped.length) {
    return [`${wrapped.length} elements, the bare render has ${bare.length}`]
  }
  return bare.flatMap((expected, index) => {
    const actual = wrapped[index]
    if (actual === undefined || actual.tag !== expected.tag) {
      return [`element ${index}: <${actual?.tag}>, the bare render has <${expected.tag}>`]
    }
    const names = new Set([...expected.attributes.keys(), ...actual.attributes.keys()])
    return [...names]
      .filter((name) => !isOwnAttribute(name))
      .filter((name) => expected.attributes.get(name) !== actual.attributes.get(name))
      .map(
        (name) =>
          `element ${index} <${actual.tag}> ${name}: ${actual.attributes.get(name) ?? 'absent'}, the bare render has ${expected.attributes.get(name) ?? 'absent'}`,
      )
  })
}

/**
The part markers, in tree order, with each marked element.
 */
export const marked = (root: ParentNode = document.body): { element: Element; part: string }[] =>
  [...root.querySelectorAll('[data-part]')].map((element) => ({
    element,
    part: element.dataset.part ?? '',
  }))

/**
A part's elements, by its `data-part` marker.
 */
export const partsNamed = (part: string, root: ParentNode = document.body): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(`[data-part="${CSS.escape(part)}"]`),
]
