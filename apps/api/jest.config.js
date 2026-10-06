import base from '@lab/jest-config'

export default {
  ...base,
  // The tests share one database, so files must not run in parallel.
  maxWorkers: 1,
}
