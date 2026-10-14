/**
 * The time a test that starts child processes is allowed. A child here is a cold `node` or `tsc`
 * start, a few hundred milliseconds of work on an idle machine, but a test run shares the machine
 * with the rest of the suite, so under load the time goes to the operating system starting many
 * short child processes, not to work the test does. A test's budget therefore scales with the
 * children it starts: one child's allowance times the number of children.
 */
const SPAWN_TEST_TIMEOUT_MS = 60_000

export const spawnBudget = (children: number): number => SPAWN_TEST_TIMEOUT_MS * children
