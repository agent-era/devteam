/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // IMPORTANT: Do NOT mock ink or ink-testing-library in E2E
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^ink$': '<rootDir>/node_modules/ink/build/index.js',
    '^ink-testing-library$': '<rootDir>/node_modules/ink-testing-library/build/index.js',
    '^ink-syntax-highlight$': '<rootDir>/node_modules/ink-syntax-highlight/build/index.js'
  },
  // Transform ESM in node_modules used by Ink and its deps
  transformIgnorePatterns: [],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022'
      }
    }],
    // Transform ESM JS from node_modules (ink, ink-testing-library)
    '^.+\\.(mjs|js)$': ['babel-jest', {
      presets: [[
        '@babel/preset-env',
        {targets: {node: 'current'}}
      ]]
    }]
  },
  testEnvironment: 'node',
  // Use a lighter setup for E2E (no global fake timers)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.e2e.ts'],
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  clearMocks: true,
  resetMocks: true
};
