import { describe, expect, test } from '@jest/globals'
import { getTestDatabaseUrl } from './test-database.js'

describe('getTestDatabaseUrl', () => {
  test('returns the URL when it points at lab_test on localhost', () => {
    const url = 'postgres://lab:secret@localhost:5432/lab_test'

    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url)
  })

  test('accepts 127.0.0.1 as the local host', () => {
    const url = 'postgres://lab:secret@127.0.0.1:5432/lab_test'

    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url)
  })

  test('refuses a URL for any other database name', () => {
    const url = 'postgres://lab:secret@localhost:5432/lab_dev'

    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(/lab_test/)
  })

  test('refuses a URL for a host that is not this machine', () => {
    const url = 'postgres://lab:secret@db.example.com:5432/lab_test'

    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(/localhost/)
  })

  test('refuses a URL that overrides the host in the query string', () => {
    const url = 'postgres://lab:secret@localhost:5432/lab_test?host=db.example.com'

    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(/query/)
  })

  test('refuses when TEST_DATABASE_URL is not set', () => {
    expect(() => getTestDatabaseUrl({})).toThrow(/TEST_DATABASE_URL/)
  })
})
