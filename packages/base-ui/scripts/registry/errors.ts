/**
 * A refusal the registry build names: which item and file it concerns, so the message points at
 * the thing to fix.
 */
export class RegistryBuildError extends Error {
  constructor(message: string, where?: { file?: string; item?: string }) {
    const prefix = [where?.item, where?.file].filter((part) => part !== undefined).join(': ')
    super(prefix === '' ? message : `${prefix}: ${message}`)
    this.name = 'RegistryBuildError'
  }
}
