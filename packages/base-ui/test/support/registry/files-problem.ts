/**
 * What a registry check reports: where it looked (the item and the file) and what it found. Checks
 * are pure functions from a registry to a list of these, so a control can run the same check over a
 * mutated clone and assert on what it names.
 */
export interface Problem {
  readonly file: string
  readonly item: string
  readonly message: string
}

export const problemText = (problem: Problem): string =>
  `${problem.item} ${problem.file}: ${problem.message}`

export const problemTexts = (problems: readonly Problem[]): string[] =>
  problems.map((problem) => problemText(problem))

/**
 * The problems that name an item and a file, as text, for an assertion on what a control reds.
 */
export const problemsAt = (problems: readonly Problem[], item: string, file: string): string[] =>
  problems
    .filter((problem) => problem.item === item && problem.file === file)
    .map((problem) => problem.message)
