/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
      },
      isolatedModules: true,
    },
  },
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};
