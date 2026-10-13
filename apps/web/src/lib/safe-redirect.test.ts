import { describe, expect, test } from '@jest/globals'
import { safeRedirect } from './safe-redirect.js'

describe('safeRedirect', () => {
  test.each([
    ['the home page', '/'],
    ['a path', '/accounts'],
    ['a path with a query and a hash', '/accounts?sort=name#top'],
  ])('keeps %s', (_name, path) => {
    expect(safeRedirect(path)).toBe(path)
  })

  test.each([
    ['a missing value', undefined],
    ['an empty string', ''],
    ['a value that is not a string', 42],
    ['an absolute URL to another site', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example/phish'],
    ['a backslash, which browsers treat as a slash', '/\\evil.example/phish'],
    ['a tab hidden between the slashes (browsers strip it)', '/\t/evil.example/phish'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path with no leading slash', 'evil.example'],
    ['a path with leading whitespace', ' /accounts'],
  ])('falls back to "/" for %s', (_name, value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})
