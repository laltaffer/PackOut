import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSync } from '../js/engine.js'

test('first sign-in with local data and an empty profile adopts local (push)', () => {
  assert.equal(resolveSync(1000, { state: null, updatedAt: 0 }), 'push')
})

test('fresh browser, stored profile: pull', () => {
  assert.equal(resolveSync(0, { state: {}, updatedAt: 500 }), 'pull')
})

test('server newer than local: pull', () => {
  assert.equal(resolveSync(400, { state: {}, updatedAt: 500 }), 'pull')
})

test('local newer than server: push', () => {
  assert.equal(resolveSync(600, { state: {}, updatedAt: 500 }), 'push')
})

test('equal clocks or both empty: nothing to do', () => {
  assert.equal(resolveSync(500, { state: {}, updatedAt: 500 }), 'none')
  assert.equal(resolveSync(0, { state: null, updatedAt: 0 }), 'none')
})
