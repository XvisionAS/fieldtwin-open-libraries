import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { findPaths } from '../src/index.js'
import { ids, subProject as subProject109  } from './fixtures/v1.9/-MWZBqfmyxgQ46p_dlg1.js'
import { subProject as subProject110 } from './fixtures/v1.10/-MWZBqfmyxgQ46p_dlg1.js'
import { subProject as subProjectParallel } from './fixtures/v1.10/-MW4y5RpTyQ-m9FywBcW.js'

const suites = [
  { apiVersion: '1.9', subProject: subProject109 },
  { apiVersion: '1.10', subProject: subProject110 }
]

describe('graph-resolver', function () {
  describe('#findPaths() basic', function () {
    for (const suite of suites) {
      const apiVersion = suite.apiVersion
      const subProject = suite.subProject

      describe(`data from API v${apiVersion}`, function () {
        it('should generate the expected graph without a connection filter', function () {
          const paths = findPaths(subProject, ids.manifold2)
          const pathNames = paths.map((path) => path.map((obj) => obj.name))
          assert.deepStrictEqual(pathNames, [
            ['Manifold #2', 'Oil Production #2', 'Template 2 slot #1', 'Well #2'],
            ['Manifold #2', 'Oil Production #2', 'Template 2 slot #1'],
            ['Manifold #2', 'Umbilical #1', 'Generic Suction Anchor #1'],
            ['Manifold #2', 'Oil Production #1', 'Manifold #1', 'Oil Production #3', 'Template 2 slot #1', 'Well #1'],
            ['Manifold #2', 'Oil Production #1', 'Manifold #1', 'Oil Production #3', 'Template 2 slot #1'],
            ['Manifold #2', 'Oil Production #1', 'Manifold #1', 'Oil Production #4', 'Manifold #3'],
          ])
        })

        it('should generate the expected graph with a connection filter', function () {
          const umbilicalId = '1'
          const paths = findPaths(subProject, ids.manifold2, undefined, umbilicalId)
          const pathNames = paths.map((path) => path.map((obj) => obj.name))
          assert.deepStrictEqual(pathNames, [
            ['Manifold #2', 'Umbilical #1', 'Generic Suction Anchor #1'],
          ])
        })

        it('should generate the expected graph for the example in the README', function () {
          const paths = findPaths(subProject, ids.manifold3, ids.template)
          const pathNames = paths.map((path) => path.map((obj) => obj.name))
          assert.deepStrictEqual(pathNames, [
            ['Manifold #3', 'Oil Production #4', 'Manifold #1', 'Oil Production #3', 'Template 2 slot #1'],
            ['Manifold #3', 'Oil Production #4', 'Manifold #1', 'Oil Production #1', 'Manifold #2', 'Oil Production #2', 'Template 2 slot #1'],
          ])
        })

        it('should follow paths starting from a well, only via the well\'s defined socket', function () {
          const paths = findPaths(subProject, ids.well1)
          const pathNames = paths.map((path) => path.map((obj) => obj.name))
          assert.deepStrictEqual(pathNames, [
            ['Well #1', 'Template 2 slot #1', 'Oil Production #3', 'Manifold #1', 'Oil Production #1', 'Manifold #2'],
            ['Well #1', 'Template 2 slot #1', 'Oil Production #3', 'Manifold #1', 'Oil Production #4', 'Manifold #3'],
          ])
        })

        it('should not follow pigging loops', function () {
          const paths = findPaths(subProject, ids.manifold2)
          assert.ok(paths.length)
          const piggingPath = paths.find((path) => path[1].id === ids.oilprod5)
          assert.deepStrictEqual(piggingPath, undefined)
        })

        it('should follow separate paths through the sockets of manifolds', function () {
          const paths = findPaths(subProject, ids.manifold1)
          assert.ok(paths.length)
          // Paths via Oil Prod 1 --> Manifold 2 should only go to Oil Prod 2
          // (socket A to A) and not follow the manifold 2 --> Umbilical 1 route
          const op1Paths = paths.filter((path) => path[1].id === ids.oilprod1)
          assert.ok(op1Paths.length)
          assert.ok(op1Paths.every((path) => path[3].id === ids.oilprod2))
        })

        it('should offer both wells from a template that covers two wells', function () {
          const paths = findPaths(subProject, ids.template)
          assert.ok(paths.length)
          const templToWell1 = paths.find(
            (path) => path.length === 2 && path[0].id === ids.template && path[1].id === ids.well1
          )
          const templToWell2 = paths.find(
            (path) => path.length === 2 && path[0].id === ids.template && path[1].id === ids.well2
          )
          assert.ok(templToWell1)
          assert.ok(templToWell2)
        })

        it('should ignore a well in metadata that has been deleted #73', function () {
          const spCopy = structuredClone(subProject)
          // delete well1, leave well2 in place
          delete spCopy.wells[ids.well1]
          const paths = findPaths(spCopy, ids.template)
          assert.ok(paths.length)
          const templToWell2 = paths.find(
            (path) => path.length === 2 && path[0].id === ids.template && path[1].id === ids.well2
          )
          assert.ok(templToWell2)
        })

        it('should return an empty path if starting from an asset with no connections', function () {
          const paths = findPaths(subProject, ids.manifold4)
          assert.deepStrictEqual(paths.length, 0)
        })

        it('should return an empty path if starting from an asset with a connection that leads nowhere', function () {
          const paths = findPaths(subProject, ids.shr)
          assert.deepStrictEqual(paths.length, 0)
        })

        it('should treat a blank socket label the same as an undefined socket label #41', function () {
          const spCopy = structuredClone(subProject)
          // Manifold #3 to Manifold #2 should go via Oil Production #4 and Oil Production #1
          const paths1 = findPaths(spCopy, ids.manifold3, ids.manifold2)
          assert.deepStrictEqual(paths1.length, 1)
          // Figure out the sockets used from Oil Production #4 across to Oil Production #1
          const inSocketName = spCopy.connections[ids.oilprod4].toSocket
          const outSocketName = spCopy.connections[ids.oilprod1].fromSocket
          assert.ok(inSocketName && outSocketName)
          // On the asset in the middle (Manifold #1), set one socket label as blank and the other as undefined
          const inSocket = spCopy.stagedAssets[ids.manifold1].sockets2d.find((socket) => socket.name === inSocketName)
          const outSocket = spCopy.stagedAssets[ids.manifold1].sockets2d.find((socket) => socket.name === outSocketName)
          assert.ok(inSocket && outSocket)
          inSocket.label = ''
          delete outSocket.label
          // We should still get the same path
          const paths2 = findPaths(spCopy, ids.manifold3, ids.manifold2)
          assert.deepStrictEqual(paths2, paths1)
        })

        it('should generate the expected graph without a connection filter with endpoint', function () {
          const paths = findPaths(subProject, ids.manifold2, ids.template)
          const pathNames = paths.map((path) => path.map((obj) => obj.name))
          assert.deepStrictEqual(pathNames, [
            ['Manifold #2', 'Oil Production #2', 'Template 2 slot #1'],
            ['Manifold #2', 'Oil Production #1', 'Manifold #1', 'Oil Production #3', 'Template 2 slot #1']
          ])
        })
      })
    }
  })

  describe('#findPaths() parallel', function () {
    it('should find 2 paths between the XMT and the FPSO v1.1', function () {
      const xmt = '-OAJ4b2uHCCr-MX3dD3x'
      const fpso = '-OAJ4b2vuqJqqFfz_7RK'
      const categoryId = 264
      const paths = findPaths(subProjectParallel, xmt, fpso, categoryId)
      assert.deepStrictEqual(paths.length, 2)
      // Expect 1 path via Oil Production #8
      const path1 = paths[0]
      const path1Names = path1.map((obj) => obj.name)
      assert.deepStrictEqual(path1Names, [
        'XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #8', 'Inline-T #2',
        'Oil Production #9', 'PLEM #2', 'Oil Production #10', 'Riser Base #2', 'Oil Production #11',
        'Generic FPSO (Turret) #2'
      ])
      // Expect 1 path via Oil Production #12
      const path2 = paths[1]
      const path2Names = path2.map((obj) => obj.name)
      assert.deepStrictEqual(path2Names, [
        'XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #12', 'Inline-T #3',
        'Oil Production #13', 'PLEM #2', 'Oil Production #10', 'Riser Base #2', 'Oil Production #11',
        'Generic FPSO (Turret) #2'
      ])
    })

    it('should not travel the same connection in both directions v1.1', function () {
      const xmt = '-OAJ4b2uHCCr-MX3dD3x'
      const categoryId = 264
      const paths = findPaths(subProjectParallel, xmt, undefined, categoryId)
      const pathNames = paths.map((path) => path.map((obj) => obj.name))
      // In v1.0 the paths marked [*] followed Oil Production #7 UP from the XMT
      // and also back DOWN to the XMT again. It also returned 7 paths since ending
      // at the XMT triggered 2 extra path variants that appended the well.
      assert.equal(paths.length, 5)
      assert.deepStrictEqual(pathNames, [
        //     XMT to well
        ['XMT deep water #2', 'Volve F_F-10_F-10_F-10_ACTUAL'],
        //     XMT to OP8, OP9 to FPSO (bottom path)
        ['XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #8', 'Inline-T #2', 'Oil Production #9', 'PLEM #2', 'Oil Production #10', 'Riser Base #2', 'Oil Production #11', 'Generic FPSO (Turret) #2'],
        // [*] XMT to OP8, OP9 and loop back OP13, OP12 back to Manifold 3 (loop anti-clockwise)
        ['XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #8', 'Inline-T #2', 'Oil Production #9', 'PLEM #2', 'Oil Production #13', 'Inline-T #3', 'Oil Production #12', 'Manifold #3'],
        //     XMT to OP12, OP13 to FPSO (top path)
        ['XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #12', 'Inline-T #3', 'Oil Production #13', 'PLEM #2', 'Oil Production #10', 'Riser Base #2', 'Oil Production #11', 'Generic FPSO (Turret) #2'],
        // [*] XMT to OP12, OP13 and loop back OP9, OP8 back to Manifold 3 (loop clockwise)
        ['XMT deep water #2', 'Oil Production #7', 'Manifold #3', 'Oil Production #12', 'Inline-T #3', 'Oil Production #13', 'PLEM #2', 'Oil Production #9', 'Inline-T #2', 'Oil Production #8', 'Manifold #3'],
      ])
    })
  })
})
