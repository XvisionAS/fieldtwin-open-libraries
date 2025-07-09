import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { ProfileExporter } from '../src/profile.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_BACKEND_URL = 'http://dummy'

const mockWell = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/v1.9/-MYK-deE2mMhjx_ZkzEU.json'), { encoding: 'utf-8' })
)

const mockConnection = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/v1.9/-MYK-deHJRkKtnr_pAtN.json'), { encoding: 'utf-8' })
)

describe('ProfileExporter [unit]', function () {
  const exporter = new ProfileExporter(TEST_BACKEND_URL)

  describe('getWellAttributes()', function () {
    const mdId = '-M19xgnbsM5ID9WexfDN'
    const wantMetadata = [{ metaDatumId: mdId }]

    it('should return attributes from well bore in preference to the well', function () {
      const well = structuredClone(mockWell)
      well.activeWellBore.metaData = [{ metaDatumId: mdId, vendorId: 'boreRoughness', name: 'Roughness', value: 0.001, option: 'cm' }]
      well.wellBores[0].metaData = well.activeWellBore.metaData
      well.metaData = [{ metaDatumId: mdId, vendorId: 'wellRoughness', name: 'Roughness', value: 0.005, option: 'cm' }]
      const attrs = exporter.getWellAttributes(well, wantMetadata)
      assert.deepStrictEqual(attrs, [{
        definitionId: undefined,
        metaDatumId: mdId,
        vendorId: 'boreRoughness',
        name: 'Roughness',
        value: 0.001,
        unit: 'cm'
      }])
    })

    it('should return attributes from well as a fallback', function () {
      const well = structuredClone(mockWell)
      well.activeWellBore.metaData = [{ metaDatumId: 'unmapped', vendorId: 'unmapped', name: 'Roughness', value: 0.001, option: 'cm' }]
      well.wellBores[0].metaData = well.activeWellBore.metaData
      well.metaData = [{ metaDatumId: mdId, vendorId: 'wellRoughness', name: 'Roughness', value: 0.005, option: 'cm' }]
      const attrs = exporter.getWellAttributes(well, wantMetadata)
      assert.deepStrictEqual(attrs, [{
        definitionId: undefined,
        metaDatumId: mdId,
        vendorId: 'wellRoughness',
        name: 'Roughness',
        value: 0.005,
        unit: 'cm'
      }])
    })

    it('should return blank if no matching metadata', function () {
      const well = structuredClone(mockWell)
      well.activeWellBore.metaData = []
      well.wellBores[0].metaData = []
      well.metaData = []
      const attrs = exporter.getWellAttributes(well, wantMetadata)
      assert.deepStrictEqual(attrs, [])
    })
  })

  describe('getWellProfile()', function () {
    it('should return path if there is one', function () {
      const well = {
        name: 'Test Well',
        wellBores: [
          {
            name: 'Well Bore #0',
            path: [
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 1, z: 1 },
            ],
          },
        ],
      }
      const path = exporter.getWellProfile(well)
      assert.deepStrictEqual(path, [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      ])
    })

    it('should return blank if the bore contains dummy data', function () {
      const well = {
        name: 'Test Well',
        wellBores: [
          {
            name: 'Well Bore #0',
            path: [{ x: 0, y: 0, z: 0 }],
          },
        ],
      }
      const path = exporter.getWellProfile(well)
      assert.deepStrictEqual(path, [])
    })

    it('should return blank if the bore path is empty', function () {
      const well = {
        name: 'Test Well',
        wellBores: [
          {
            name: 'Well Bore #0',
            path: [],
          },
        ],
      }
      const path = exporter.getWellProfile(well)
      assert.deepStrictEqual(path, [])
    })

    it('should return blank if there are no bores', function () {
      const well = {
        name: 'Test Well',
        wellBores: [],
      }
      const path = exporter.getWellProfile(well)
      assert.deepStrictEqual(path, [])
    })
  })

  describe('simplifyPoints()', function () {
    it('should handle an empty list', function () {
      assert.deepStrictEqual(exporter.simplifyPoints([], 1), [])
    })

    it('should simplify points in a non-empty list', function () {
      const pts = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
        { x: 2, y: 2, z: 2 },
        { x: 3, y: 3, z: 3 }, // straight to here
        { x: 4, y: 3, z: 3 }, // bend
        { x: 5, y: 2, z: 3 }, // bend
        { x: 6, y: 2, z: 3 },
        { x: 7, y: 2, z: 3 }, // straight to here
      ]
      const expect = [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 3, z: 3 },
        { x: 4, y: 3, z: 3 },
        { x: 5, y: 2, z: 3 },
        { x: 7, y: 2, z: 3 },
      ]
      assert.deepStrictEqual(exporter.simplifyPoints(pts, 0.1), expect)
    })
  })

  describe('pointsToSeaLevel()', function () {
    it('should return z values unchanged for ref level sea', function () {
      const well = { referenceLevel: 'sea', rkb: 0 }
      const pts = [
        { x: 0, y: 0, z: -1000 },
        { x: 0, y: 0, z: -1030 },
        { x: 0, y: 0, z: -1060 },
      ]
      const expect = structuredClone(pts)
      exporter.pointsToSeaLevel(well, pts, 1200)
      assert.deepStrictEqual(pts, expect)
    })

    it('should return z values adjusted for ref level rkb', function () {
      const well = { referenceLevel: 'rkb', rkb: 20 }
      const pts = [
        { x: 0, y: 0, z: -1000 },
        { x: 0, y: 0, z: -1030 },
        { x: 0, y: 0, z: -1060 },
      ]
      const expect = [
        { x: 0, y: 0, z: -980 },
        { x: 0, y: 0, z: -1010 },
        { x: 0, y: 0, z: -1040 },
      ]
      exporter.pointsToSeaLevel(well, pts, 1200)
      assert.deepStrictEqual(pts, expect)
    })

    it('should return z values adjusted for ref level seabed', function () {
      const well = { referenceLevel: 'seabed', rkb: 0 }
      const pts = [
        { x: 0, y: 0, z: -1000 },
        { x: 0, y: 0, z: -1030 },
        { x: 0, y: 0, z: -1060 },
      ]
      const expect = [
        { x: 0, y: 0, z: -2200 },
        { x: 0, y: 0, z: -2230 },
        { x: 0, y: 0, z: -2260 },
      ]
      exporter.pointsToSeaLevel(well, pts, 1200)
      assert.deepStrictEqual(pts, expect)
    })

    it('should ignore the sign of the input z values', function () {
      const well = { referenceLevel: 'seabed', rkb: 0 }
      const pts = [
        { x: 0, y: 0, z: 1000 },
        { x: 0, y: 0, z: 1030 },
        { x: 0, y: 0, z: 1060 },
      ]
      const expect = [
        { x: 0, y: 0, z: -2200 },
        { x: 0, y: 0, z: -2230 },
        { x: 0, y: 0, z: -2260 },
      ]
      exporter.pointsToSeaLevel(well, pts, 1200)
      assert.deepStrictEqual(pts, expect)
    })
  })

  describe('buildObjectAttributes()', function () {
    const wantById = [
      { metaDatumId: '-M19wn-KQoW7WZhT91rx' },
      { metaDatumId: '-M19xgnbsM5ID9WexfDN' },
      { metaDatumId: '-MuKzFyd8piF3G8nCqjV' },
      { metaDatumId: '-MuKzeFFKRRmmhY1Hig3' },
    ]
    const wantByVendor = [
      { vendorId: 'Acme.NetworkType' },
      { vendorId: 'Acme.Roughness' },
      { vendorId: 'Acme.WallThickness' },
      { vendorId: 'Acme.UValue' },
    ]

    it('should return attributes that match the request', function () {
      for (const wantMetadata of [wantById, wantByVendor]) {
        const connection = structuredClone(mockConnection)
        const result = exporter.buildObjectAttributes(connection, wantMetadata)
        assert.deepStrictEqual(result, [
          {
            definitionId: undefined,
            metaDatumId: '-M19wn-KQoW7WZhT91rx',
            vendorId: 'Acme.NetworkType',
            name: 'Network Type',
            value: 'Production network',
            unit: '',
          },
          {
            definitionId: undefined,
            metaDatumId: '-M19xgnbsM5ID9WexfDN',
            vendorId: 'Acme.Roughness',
            name: 'Roughness',
            value: 0.003,
            unit: 'cm',
          },
          {
            definitionId: 'AcmePOC:Acme.WallThickness[numerical.Length.Short Length]',
            metaDatumId: '-MuKzFyd8piF3G8nCqjV',
            vendorId: 'Acme.WallThickness',
            name: 'Wall Thickness',
            value: 2.5,
            unit: 'cm',
          },
          {
            definitionId: 'AcmePOC:UValue[numerical.General.U Value]',
            metaDatumId: '-MuKzeFFKRRmmhY1Hig3',
            vendorId: 'Acme.UValue',
            name: 'U-Value',
            value: 2.2,
            unit: 'W/m2/C',
          },
        ])
      }
    })

    it('should omit the attribute if metadata value is undefined #47', function () {
      const connection = structuredClone(mockConnection)
      const wantMetadata = structuredClone(wantById)
      // Check first that we get 4 attributes normally
      let result = exporter.buildObjectAttributes(connection, wantMetadata)
      assert.deepStrictEqual(result.length, 4)
      // Set up undefined values in 2 ways
      const md1 = connection.metaData.find((md) => md.metaDatumId === wantMetadata[0].metaDatumId)
      const md2 = connection.metaData.find((md) => md.metaDatumId === wantMetadata[1].metaDatumId)
      const md3 = connection.metaData.find((md) => md.metaDatumId === wantMetadata[2].metaDatumId)
      const md4 = connection.metaData.find((md) => md.metaDatumId === wantMetadata[3].metaDatumId)
      assert.ok(md1 && md2 && md3 && md4)
      delete md1.value
      md2.value = null
      md3.value = null
      delete md4.value
      // Re-test #47
      result = exporter.buildObjectAttributes(connection, wantMetadata)
      assert.deepStrictEqual(result, [])
    })

    it('should omit attributes where there is no matching metadata', function () {
      const connection = structuredClone(mockConnection)
      const wantMetadata = structuredClone(wantById)
      // Remove roughness and uValue from the connection's metaData
      const roughnessDefinitionId = '-M19xgnbsM5ID9WexfDN'
      const uvalueDefinitionId = '-MuKzeFFKRRmmhY1Hig3'
      connection.metaData = connection.metaData.filter(
        (md) => md.metaDatumId !== roughnessDefinitionId && md.metaDatumId !== uvalueDefinitionId
      )
      const result = exporter.buildObjectAttributes(connection, wantMetadata)
      assert.deepStrictEqual(result, [
        {
          definitionId: undefined,
          metaDatumId: '-M19wn-KQoW7WZhT91rx',
          vendorId: 'Acme.NetworkType',
          name: 'Network Type',
          value: 'Production network',
          unit: '',
        },
        {
          definitionId: 'AcmePOC:Acme.WallThickness[numerical.Length.Short Length]',
          metaDatumId: '-MuKzFyd8piF3G8nCqjV',
          vendorId: 'Acme.WallThickness',
          name: 'Wall Thickness',
          value: 2.5,
          unit: 'cm',
        },
      ])
    })

    it('should return no attributes for an empty mapping', function () {
      const connection = structuredClone(mockConnection)
      const wantMetadata = []
      const result = exporter.buildObjectAttributes(connection, wantMetadata)
      assert.deepStrictEqual(result, [])
    })
  })

  describe('trimPointsToMD()', function () {
    it('should fail if MD is negative', function () {
      try {
        exporter.trimPointsToMD([], -1)
        assert.fail('expected function call to fail')
      } catch (e) {
        assert.ok(String(e).includes('negative distance'))
      }
    })

    it('should do nothing without enough points', function () {
      const points1 = []
      exporter.trimPointsToMD(points1, 100)
      assert.deepEqual(points1, [])
      const points2 = [{x: 0, y: 0, z: 0}]
      exporter.trimPointsToMD(points2, 100)
      assert.deepEqual(points2, [{x: 0, y: 0, z: 0}])
    })

    it('should trim to nearest calculated MD', function () {
      const points1 = [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110}, // MD 17.32
        {x: 20, y: 20, z: -120}, // MD 34.64
        {x: 30, y: 30, z: -130}, // MD 51.96
        {x: 40, y: 40, z: -140}, // MD 69.28
        {x: 50, y: 50, z: -150}, // MD 86.60
      ]
      const points2 = [...points1]
      const points3 = [...points1]
      exporter.trimPointsToMD(points1, 55)
      assert.deepEqual(points1, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
      ])
      exporter.trimPointsToMD(points2, 65)
      assert.deepEqual(points2, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
        {x: 40, y: 40, z: -140},
      ])
      exporter.trimPointsToMD(points3, 2000)
      assert.deepEqual(points3, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
        {x: 40, y: 40, z: -140},
        {x: 50, y: 50, z: -150},
      ])
    })

    it('should trim using existing MD if MD is present in data', function () {
      // FieldTwin well bores can have a `depth` attribute already in the points
      // If it is present then we will trust it
      const points1 = [
        {x: 0, y: 0, z: -100, depth: 0},
        {x: 10, y: 10, z: -110, depth: 50},
        {x: 20, y: 20, z: -120, depth: 100},
        {x: 30, y: 30, z: -130, depth: 150},
        {x: 40, y: 40, z: -140, depth: 200},
        {x: 50, y: 50, z: -150, depth: 250},
      ]
      exporter.trimPointsToMD(points1, 55)
      assert.deepEqual(points1, [
        {x: 0, y: 0, z: -100, depth: 0},
        {x: 10, y: 10, z: -110, depth: 50},
      ])
    })
  })

  describe('trimPointsToZ()', function () {
    it('should do nothing without enough points', function () {
      const points1 = []
      exporter.trimPointsToZ(points1, 100)
      assert.deepEqual(points1, [])
      const points2 = [{x: 0, y: 0, z: 0}]
      exporter.trimPointsToZ(points2, 100)
      assert.deepEqual(points2, [{x: 0, y: 0, z: 0}])
    })

    it('should trim to nearest Z in vertical well', function () {
      const points1 = [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
        {x: 40, y: 40, z: -140},
        {x: 50, y: 50, z: -150},
      ]
      const points2 = [...points1]
      const points3 = [...points1]
      exporter.trimPointsToZ(points1, -122)
      assert.deepEqual(points1, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
      ])
      exporter.trimPointsToZ(points2, -128)
      assert.deepEqual(points2, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
      ])
      exporter.trimPointsToZ(points3, -2000)
      assert.deepEqual(points3, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -130},
        {x: 40, y: 40, z: -140},
        {x: 50, y: 50, z: -150},
      ])
    })

    it('should trim to nearest Z in horizontal well', function () {
      // A horizontal-ish well could rise and fall to touch the Z point multiple times
      // If so we will take the bore through to the final touch point
      const points1 = [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120}, // not to here
        {x: 30, y: 30, z: -110},
        {x: 40, y: 40, z: -100},
        {x: 50, y: 50, z: -110},
        {x: 60, y: 60, z: -120}, // but here
        {x: 70, y: 70, z: -130},
      ]
      exporter.trimPointsToZ(points1, -120)
      assert.deepEqual(points1, [
        {x: 0, y: 0, z: -100},
        {x: 10, y: 10, z: -110},
        {x: 20, y: 20, z: -120},
        {x: 30, y: 30, z: -110},
        {x: 40, y: 40, z: -100},
        {x: 50, y: 50, z: -110},
        {x: 60, y: 60, z: -120},
      ])
    })
  })
})
