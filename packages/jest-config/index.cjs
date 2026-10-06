// Shared Jest settings for every workspace. Each workspace's jest.config.js imports this package and spreads it.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  extensionsToTreatAsEsm: ['.ts'],
  // Source imports use the .js extension that Node needs at runtime; Jest must find the .ts file.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } },
    ],
  },
}
