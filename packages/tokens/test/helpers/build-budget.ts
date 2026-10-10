/**
 * The time a test that runs the token build in this process is allowed. One build is a few tens of
 * milliseconds of work, but a test run shares the machine with the rest of the suite, so under
 * load the time goes to waiting for a turn, not to work. A test's budget therefore scales with the
 * builds it runs: one build's allowance times the number of builds.
 */
const BUILD_TEST_TIMEOUT_MS = 60_000

export const buildBudget = (builds: number): number => BUILD_TEST_TIMEOUT_MS * builds
