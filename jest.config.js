/** @type {import('jest').Config} */
export default {
  // Run unit/integration and e2e as separate Jest projects
  projects: [
    '<rootDir>/jest.unit.config.js',
    '<rootDir>/jest.e2e.config.js'
  ]
};
