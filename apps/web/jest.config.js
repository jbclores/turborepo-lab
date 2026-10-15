import base from '@lab/jest-config'

// Test workers inherit this, so every web test runs in Manila time whatever the machine's zone
// (GitHub's runners use UTC). Setting process.env.TZ inside a test file does not work: Jest gives each
// file its own copy of process.env, and Node's time zone is never told.
process.env.TZ = 'Asia/Manila'

export default base
