import base from '../../jest.config.base.cjs'

export default {
  ...base,
  // Every test file shares one database, so files must not run in parallel.
  maxWorkers: 1,
}
