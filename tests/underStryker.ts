// Whether Stryker runs the tests. Its Vitest setup file sets one of these globals before each
// test file. The timing tests skip themselves there: Stryker's instrumented code runs them 6 to 9
// times slower, and once for each mutant that they cover (AFA-95).
export const underStryker = '__stryker__' in globalThis || '__stryker2__' in globalThis;
