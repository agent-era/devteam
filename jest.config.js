/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock ink and ink-testing-library to avoid ESM issues
    '^ink$': '<rootDir>/tests/__mocks__/ink.js',
    '^ink-testing-library$': '<rootDir>/tests/__mocks__/ink-testing-library.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(ink|ink-testing-library)/)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022'
      }
    }]
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  testTimeout: 10000,
  // Configure fake timers for performance
  fakeTimers: {
    enableGlobally: true,
    advanceTimers: true,
  },
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true
};