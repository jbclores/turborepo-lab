import base from '@lab/jest-config'

export default {
  ...base,
  // Every test file shares one database, so files must not run in parallel.
  maxWorkers: 1,
}
