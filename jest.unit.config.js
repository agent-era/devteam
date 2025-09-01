/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock ink and ink-testing-library to avoid ESM issues in unit/integration tests
    '^ink$': '<rootDir>/tests/__mocks__/ink.js',
    '^ink-testing-library$': '<rootDir>/tests/__mocks__/ink-testing-library.js',
    '^ink-syntax-highlight$': '<rootDir>/tests/__mocks__/ink-syntax-highlight.js',
    '^@inkjs/ui$': '<rootDir>/tests/__mocks__/@inkjs/ui.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(ink|ink-testing-library|ink-syntax-highlight)/)'
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
    '<rootDir>/tests/{unit,integration}/**/*.test.{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  fakeTimers: {
    enableGlobally: true,
    advanceTimers: true,
  },
  clearMocks: true,
  resetMocks: true
};
