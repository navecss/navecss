/**
 * What the wrappers declare must hold under every Base UI the package supports, and the generator
 * reads the current one. This reads the floor as well and narrows the current declarations to what
 * both agree on: a type namespace keeps the members the floor declares, with the type parameters
 * the floor gives them, the type-only members of a component's namespace are kept the same way,
 * and a part the floor does not have is declared as a type that resolves to
 * that part where it exists and to `never` where it does not.
 */
import type { PartTypes, SubpathTypes } from './read-types.ts'

import { readBaseUiTypes } from './read-types.ts'

const sharedPart = (part: PartTypes, atFloor: PartTypes | undefined): PartTypes => {
  if (atFloor === undefined) {
    if (part.kind !== 'function') {
      throw new Error(
        `${part.name} is younger than the floor and is a ${part.kind}: only a function can be declared absent`,
      )
    }
    return { ...part, members: [], young: true }
  }
  const members = atFloor.members.filter((member) =>
    part.members.some((current) => current.name === member.name),
  )
  return { ...part, members }
}

const sharedSubpath = (current: SubpathTypes, atFloor: SubpathTypes | undefined): SubpathTypes => {
  if (atFloor === undefined) {
    throw new Error(`${current.subpath} is not declared at the floor Base UI`)
  }
  return {
    ...current,
    parts: current.parts.map((part) =>
      sharedPart(
        part,
        atFloor.parts.find((candidate) => candidate.name === part.name),
      ),
    ),
    typeMembers: atFloor.typeMembers.filter((member) =>
      current.typeMembers.some((candidate) => candidate.name === member.name),
    ),
  }
}

/**
The declarations of every subpath, narrowed to what the current and the floor Base UI both declare.
 */
export const readSharedTypes = (): SubpathTypes[] => {
  const atFloor = readBaseUiTypes('floor')
  return readBaseUiTypes('current').map((subpath) =>
    sharedSubpath(
      subpath,
      atFloor.find((candidate) => candidate.subpath === subpath.subpath),
    ),
  )
}
