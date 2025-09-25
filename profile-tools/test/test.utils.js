import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { removeDuplicatePoints } from '../src/utils.js'

/**
 * @typedef {import('@xvisionas/profile-tools').FlatPoint} FlatPoint
 */

describe('Utils', function () {
  describe('removeDuplicatePoints()', function () {
    it('should return an empty array if given an empty array', function () {
      const profile = []
      const cleaned = removeDuplicatePoints(profile)
      assert.deepEqual(cleaned, [])
    })

    it('should return the same array if given a single point', function () {
      /** @type {Array<FlatPoint>}} */
      const profile = [[0, 0, 0]]
      const cleaned = removeDuplicatePoints(profile)
      assert.deepEqual(cleaned, profile)
    })

    it('should return the same profile if there are no duplicates', function () {
      /** @type {Array<FlatPoint>}} */
      const profile = [
        [0.0, 0.0, 0.0],
        [1.1, 1.1, 1.1],
        [2.2, 2.2, 2.2],
      ]
      const cleaned = removeDuplicatePoints(profile)
      assert.deepEqual(cleaned, profile)
      // Ensure cleaned array is a copy
      assert.notEqual(cleaned, profile)
    })

    it('should remove consecutive duplicate points', function () {
      /** @type {Array<FlatPoint>}} */
      const profile = [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [1.1, 1.1, 1.1],
        [1.1, 1.1, 1.1],
        [1.1, 1.1, 1.1],
        [2.2, 2.2, 2.2],
        [2.2, 2.2, 2.2],
        [2.2, 2.2, 2.2],
        [2.2, 2.2, 2.2],
        [3.3, 3.3, 3.3],
        [3.3, 3.3, 3.3],
      ]
      const expected = [
        [0.0, 0.0, 0.0],
        [1.1, 1.1, 1.1],
        [2.2, 2.2, 2.2],
        [3.3, 3.3, 3.3],
      ]
      const cleaned = removeDuplicatePoints(profile)
      assert.deepEqual(cleaned, expected)
    })

    it('should handle profiles with all points the same', function () {
      /** @type {Array<FlatPoint>}} */
      const profile = [
        [1.1, 1.1, 1.1],
        [1.1, 1.1, 1.1],
        [1.1, 1.1, 1.1],
      ]
      const expected = [
        [1.1, 1.1, 1.1]
      ]
      const cleaned = removeDuplicatePoints(profile)
      assert.deepEqual(cleaned, expected)
    })
  })
})
