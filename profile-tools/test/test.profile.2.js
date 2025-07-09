import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'
import { before, beforeEach, describe, it } from 'node:test'
import nock from 'nock'

import { ProfileExporter } from '../src/profile.js'
import { round } from '../src/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_JWT = 'eieio'
const TEST_BACKEND_URL = 'http://dummy'
const FT_API_URL = `${TEST_BACKEND_URL}/API/v1.10`

const mockPath = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/path.json'), { encoding: 'utf-8' })
)

const mockWellId = '-MYK-deE2mMhjx_ZkzEU'
const mockWell = JSON.parse(
  fs.readFileSync(path.join(__dirname, `fixtures/v1.9/${mockWellId}.json`), { encoding: 'utf-8' })
)
const mockWellDepth = Math.round(mockWell.z)
const mockWellBoreGap = 10

const mockConnIds = [
  '-MYK-deHJRkKtnr_pAtN',
  '-MYK-deHJRkKtnr_pAsw', // designType: 'Imported', noHeightSampling: true
  '-MYK-deHJRkKtnr_pAss',
  '-MYK-deHJRkKtnr_pAt-',
  '-MYK-deHJRkKtnr_pAsz',
]
const mockConns = []
mockConnIds.forEach((id) => {
  const conn = JSON.parse(
    fs.readFileSync(path.join(__dirname, `fixtures/v1.9/${id}.json`), { encoding: 'utf-8' })
  )
  mockConns.push(conn)
})

const mockProjectId = '-MYK-de5CLBSrP6xXC0G'
const mockSubProjectId = '-MYK-de6thIV5gW4fCB-'
const mockSeabedDepth = -1234
const mockSurveyDepth = -1165

// Prevent accidental modification
Object.freeze(mockPath)
Object.freeze(mockWell)
mockConns.forEach((c) => Object.freeze(c))

describe('ProfileExporter [integration]', function () {
  const exporter = new ProfileExporter(TEST_BACKEND_URL)
  exporter.setJWT(TEST_JWT)

  const importedConnectionIdx = mockConns.findIndex((c) => Object.keys(c.importParams || {}).length > 0)
  const importedConnection = mockConns[importedConnectionIdx]
  const importedConnectionId = mockConnIds[importedConnectionIdx]
  if (!importedConnection || !importedConnectionId) {
    throw new Error('No imported connection found in the test data')
  }

  before(async function () {
    nock.disableNetConnect()
  })
  beforeEach(function () {
    nock.cleanAll()
  })

  // Utility to swap the from/to direction of a connection
  // Note: does not reverse the coordinates or points since we test for that being done
  function swapFromTo(conn) {
    const oldSocket = conn.fromSocket
    const oldFrom = conn.from
    conn.fromSocket = conn.toSocket
    conn.from = conn.to
    conn.toSocket = oldSocket
    conn.to = oldFrom
  }

  // Utility to make points from 0,0,0 to 999,0,0 with a given gap
  function makePoints(gap) {
    const points = []
    for (let i = 0; i < 1000; i += gap) {
      points.push({ x: i, y: 0, z: 0 })
    }
    return points
  }

  // Utility to make a well bore path from well.x,well.y,start to well.x,well.y,start-999 with a given gap
  function makeBorePath(well, start, gap) {
    const points = []
    for (let i = 0; i < 1000; i += gap) {
      points.push({ x: well.x, y: well.y, z: start - i })
    }
    return points
  }

  // Utility to apply the same rounding as used in the JSON output
  function r(val) { return round(val, 4) }

  // Utility to mock all the API calls required for exporting a flowpath
  function setupPathGetterMocks(options = {}) {
    const {
      sampling,
      simplify,
      reverseConn1,
      make1kmConn1,
      reverseImportedConn,
      noHeightSamplingImportedConn,
      rawImportedConn,
      noDesignImportedConn,
      negateBoreZ,
      makeVerticalBore,
    } = options

    // Clone the mocked data so we can modify it per test
    const useSampling = sampling || 1
    const useWell = structuredClone(mockWell)
    const useConns = structuredClone(mockConns)
    const useImportedConn = useConns[importedConnectionIdx]

    // Modify the mock data as requested in `options`
    if (reverseConn1) {
      const c = useConns[0]
      swapFromTo(c)
    }
    if (make1kmConn1) {
      const c = useConns[0]
      c.length = 1000
      c.sampled = makePoints(useSampling)
    }
    if (reverseImportedConn) {
      swapFromTo(useImportedConn)
    }
    if (noHeightSamplingImportedConn !== undefined) {
      useImportedConn.noHeightSampling = noHeightSamplingImportedConn
      if (useImportedConn.noHeightSampling === false) {
        // Emulate height sampling
        useImportedConn.intermediaryPoints.forEach((point) => point.z = mockSeabedDepth)
        useImportedConn.sampled.forEach((point, idx) => {
          // FTAPI returns the from/to coordinates (with socket depth) as the first and last points
          // in `sampled` so do not change these
          if (idx !== 0 && idx !== useImportedConn.sampled.length - 1) {
            point.z = mockSeabedDepth
          }
        })
      }
    }
    if (noDesignImportedConn) {
      // v1.1.1 some imported connections have designType: None
      useImportedConn.designType = 'None'
    }
    if (negateBoreZ) {
      useWell.wellBores.forEach((bore) => bore.path.forEach((point) => (point.z *= -1)))
      useWell.activeWellBore.path.forEach((point) => (point.z *= -1))
    }
    if (makeVerticalBore) {
      const borePath = makeBorePath(useWell, 0, mockWellBoreGap) // start at 0 for referenceLevel seabed
      useWell.wellBores[0] = borePath
      useWell.activeWellBore.path = borePath
    }

    // Mock the API calls made when assembling the exported profiles

    const loadHeadersInit = {
      'accept': 'application/json',
      'authorization': 'Bearer ' + TEST_JWT,
    }
    let loadHeaders = structuredClone(loadHeadersInit)
    // Load project to get the CRS
    nock(FT_API_URL, { reqheaders: loadHeaders })
      .get(`/${mockProjectId}/basic`)
      .reply(200, { id: mockProjectId, name: 'Test Project', CRS: 'EPSG:1234', coordinateUnits: 'm' })
    // Load wells referenced from the test path
    nock(FT_API_URL, { reqheaders: loadHeaders })
      .get(`/${mockProjectId}/subProject/${mockSubProjectId}/well/${mockWellId}`)
      .reply(200, useWell)
    // Load seabed depth for well
    nock(FT_API_URL, { reqheaders: loadHeaders })
      .post(`/${mockProjectId}/subProject/${mockSubProjectId}/heightSamples`)
      .reply(200, { depths: [mockWellDepth] })
    // Load sampled connections referenced from the test path
    // This part mocks profile.loadConnectionDefault()
    loadHeaders['sample-every'] = `${useSampling}`
    if (simplify) {
      loadHeaders['simplify'] = 'true'
      loadHeaders['simplify-tolerance'] = '1'
    }
    mockConnIds.forEach((id, idx) => {
      nock(FT_API_URL, { reqheaders: loadHeaders })
        .get(`/${mockProjectId}/subProject/${mockSubProjectId}/connection/${id}`)
        .reply(200, useConns[idx])
    })
    // For profile type 'raw' we re-request the raw data for the imported connection
    // This part mocks profile.loadConnectionRaw()
    if (rawImportedConn) {
      loadHeaders = {
        ...loadHeadersInit,
        'raw-intermediary': 'true',
      }
      useImportedConn.intermediaryPoints.forEach((point) => point.z = mockSurveyDepth)
      nock(FT_API_URL, { reqheaders: loadHeaders })
        .get(`/${mockProjectId}/subProject/${mockSubProjectId}/connection/${importedConnectionId}`)
        .reply(200, useImportedConn)
    }
  }

  it('should export a path from 0,0 with relative XY points', async function () {
    setupPathGetterMocks()
    const data = await exporter.exportProfiles(
      mockPath, [], { relativePoints: true }, mockProjectId, mockSubProjectId
    )

    assert.equal(data.projectId, mockProjectId)
    assert.equal(data.subProjectId, mockSubProjectId)
    // We expect 6 profiles = 1 well + 5 connections
    assert.equal(data.profiles.length, 6)
    // first should be for the well NC2P1
    // at -1172m sea bed and -60m bore path end point (ref level sea bed)
    const profile1 = data.profiles[0]
    assert.deepStrictEqual(profile1.id, mockWellId)
    assert.ok(profile1.profile.length)
    // See mockWell.activeWellBore.path,
    // should go up (from the end of the bore) when path starts at a well
    assert.deepStrictEqual(profile1.profile[0], [0, 0, (mockWellDepth - 60)])
    assert.deepStrictEqual(profile1.profile[1], [0, -10, (mockWellDepth - 30)])
    assert.deepStrictEqual(profile1.profile[2], [0, -20, (mockWellDepth - 0)])
    // CRS should not be set when generating relative points
    assert.equal(data.CRS, undefined)
    assert.equal(data.unit, 'm')
  })

  it('should export a path from x,y with absolute XY points', async function () {
    setupPathGetterMocks()
    const data = await exporter.exportProfiles(
      mockPath, [], { relativePoints: false }, mockProjectId, mockSubProjectId
    )

    // We expect 6 profiles = 1 well + 5 connections
    assert.equal(data.profiles.length, 6)
    // first should be for the well NC2P1
    // at -1172m sea bed and -60m bore path end point (ref level sea bed)
    const profile1 = data.profiles[0]
    assert.deepStrictEqual(profile1.id, mockWellId)
    assert.ok(profile1.profile.length)
    // See mockWell.activeWellBore.path,
    // should go up (from the end of the bore) when path starts at a well
    assert.deepStrictEqual(profile1.profile[0], [392026, 5308607, (mockWellDepth - 60)])
    assert.deepStrictEqual(profile1.profile[1], [392026, 5308597, (mockWellDepth - 30)])
    assert.deepStrictEqual(profile1.profile[2], [392026, 5308587, (mockWellDepth - 0)])
    // CRS should be set
    assert.equal(data.CRS, 'EPSG:1234')
    assert.equal(data.unit, 'm')
  })

  it('should return metadata per profile', async function () {
    const wanted = [
      { vendorId: 'Acme.InsideDiameter' },
      { vendorId: 'Acme.Roughness' },
      { vendorId: 'Acme.WallThickness' },
      { vendorId: 'Acme.UValue' },
    ]

    setupPathGetterMocks()
    const data = await exporter.exportProfiles(
      mockPath, wanted, {}, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    // Check first profile - the well NC2P1
    let profile = data.profiles[0]
    assert.deepStrictEqual(profile.id, mockWellId)
    assert.deepStrictEqual(profile.attributes, [
      {
        definitionId: undefined,
        metaDatumId: '-M19xXO5UH3nXaY44ykr',
        vendorId: 'Acme.InsideDiameter',
        name: 'Inside Diameter',
        value: 30,
        unit: 'cm',
      },
      {
        definitionId: undefined,
        metaDatumId: '-M19xgnbsM5ID9WexfDN',
        vendorId: 'Acme.Roughness',
        name: 'Roughness',
        value: 0.002,
        unit: 'cm',
      },
      {
        definitionId: 'AcmePOC:Acme.WallThickness[numerical.Length.Short Length]',
        metaDatumId: '-MuKzFyd8piF3G8nCqjV',
        vendorId: 'Acme.WallThickness',
        name: 'Wall Thickness',
        value: 4.3,
        unit: 'cm',
      },
      {
        definitionId: 'AcmePOC:UValue[numerical.General.U Value]',
        metaDatumId: '-MuKzeFFKRRmmhY1Hig3',
        vendorId: 'Acme.UValue',
        name: 'U-Value',
        value: 3.2,
        unit: 'W/m2/C',
      }
    ])
    // Check last profile - the last connection
    profile = data.profiles[5]
    assert.deepStrictEqual(profile.id, mockConnIds[mockConnIds.length - 1])
    assert.deepStrictEqual(profile.attributes, [
      {
        definitionId: undefined,
        metaDatumId: '-M19xXO5UH3nXaY44ykr',
        vendorId: 'Acme.InsideDiameter',
        name: 'Inside Diameter',
        value: 28.7,
        unit: 'cm',
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
      }
    ])
  })

  it('should return the profiles in the correct direction', async function () {
    // Reverse connection 1 so we follow it in the to-from direction
    setupPathGetterMocks({ reverseConn1: true })
    const data = await exporter.exportProfiles(
      mockPath, [], { relativePoints: true }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    // Well is the first profile
    const profile1 = data.profiles[0]
    assert.deepStrictEqual(profile1.id, mockWellId)
    // Connection 1 is the second profile
    const profile2 = data.profiles[1]
    assert.deepStrictEqual(profile2.id, mockConnIds[0])
    assert.ok(profile2.profile.length)
    // Connection 1 profile should be reversed giving (conn.sampled[last] - well top hole) as
    // the first xy point and (conn.sampled[last-1] - conn.sampled[last]) as the second xy point
    const first = profile2.profile[0]
    const second = profile2.profile[1]
    const sampled = mockConns[0].sampled
    const last = sampled.length - 1
    assert.deepStrictEqual(second, [
      r(first[0] + (sampled[last - 1].x - sampled[last].x)),
      r(first[1] + (sampled[last - 1].y - sampled[last].y)),
      second[2],
    ])
  })

  it('should return well bore from top to bottom if last in the path', async function () {
    setupPathGetterMocks()

    // Reverse the path so the well is last
    const usePath = structuredClone(mockPath).reverse()
    const data = await exporter.exportProfiles(
      usePath, [], { relativePoints: true }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    // profile6 should be for the well NC2P1 this time
    const profile6 = data.profiles[5]
    assert.deepStrictEqual(profile6.id, mockWellId)
    assert.ok(profile6.profile.length)
    // See mockWell.activeWellBore.path,
    // should go down (from the top of the bore) when path ends at a well
    const z1 = profile6.profile[0][2]
    const z2 = profile6.profile[1][2]
    const z3 = profile6.profile[2][2]
    assert.ok(z2 < z1)
    assert.ok(z3 < z2)
    assert.ok(z3 < 0) // lower than the flowpath start
  })

  it('should ignore the sign of z in well bore paths', async function () {
    const results = []
    const tests = [false, true]

    for (const negateZ of tests) {
      nock.cleanAll()
      // Set well bore.z as 0,-30,-60 (test 1) or 0,30,60 (test 2)
      setupPathGetterMocks({ negateBoreZ: negateZ })
      const data = await exporter.exportProfiles(
        mockPath, [], {}, mockProjectId, mockSubProjectId
      )
      assert.ok(data.profiles.length)
      results.push(data)
    }
    // Both flowpaths should be the same
    assert.deepStrictEqual(results[0], results[1])
  })

  it('should use z from sea level in well bore paths', async function () {
    // For this test we want to start from a well, have the wellbore's top hole
    // at 0 from ref level "seabed" and the first connection also starting
    // (approximately) at the sea bed
    const tolerance = 5
    assert.deepStrictEqual(mockWell.referenceLevel, 'seabed')
    assert.deepStrictEqual(mockWell.activeWellBore.path[0].z, 0)
    assert.ok(mockConns[0].sampled[0].z - mockWell.z < tolerance)
    setupPathGetterMocks()

    const data = await exporter.exportProfiles(
      mockPath, [], {}, mockProjectId, mockSubProjectId
    )
    assert.ok(data.profiles.length)

    // profile1 should be for the well NC2P1
    // profile2 should be for the first connection
    const profile1 = data.profiles[0]
    assert.deepStrictEqual(profile1.id, mockWellId)
    const profile2 = data.profiles[1]
    assert.deepStrictEqual(profile2.id, mockConnIds[0])
    // profile2[first].z and profile1[last].z should be (approximately) the same
    const p1coords = profile1.profile
    const p2coords = profile2.profile
    assert.ok(p2coords[0][2] - p1coords[p1coords.length - 1][2] < tolerance)
  })

  it('should respect the sample width setting', async function () {
    // The test here is that the 77 is included in the nock headers
    // so we are testing that the API is called with that sample-every value
    setupPathGetterMocks({ sampling: 77 })
    const data = await exporter.exportProfiles(
      mockPath, [], { sampleWidth: 77 }, mockProjectId, mockSubProjectId
    )
    assert.ok(data.profiles.length)
  })

  it('should export intermediary points for imported connections by default INTE-649', async function () {
    setupPathGetterMocks()
    const data = await exporter.exportProfiles(
      mockPath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)

    // We can just check the number of points as long as sampled.length != imported points length
    const importedPointsLen = importedConnection.intermediaryPoints.length + 2
    assert.notEqual(importedConnection.sampled.length, importedPointsLen)
    // The imported connection should export its fromCoordinate + intermediaryPoints + toCoordinate
    assert.equal(imported.profile.length, importedPointsLen)
    assert.equal(
      imported.profile[0][2],
      r(importedConnection.fromCoordinate.z)
    )
    assert.equal(
      imported.profile[importedPointsLen - 1][2],
      r(importedConnection.toCoordinate.z)
    )
  })

  it('should return intermediary points in the correct direction INTE-649', async function () {
    setupPathGetterMocks({ reverseImportedConn: true })
    const data = await exporter.exportProfiles(
      mockPath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)

    // Check we got the intermediary points not the sampled
    const importedPointsLen = importedConnection.intermediaryPoints.length + 2
    assert.equal(imported.profile.length, importedPointsLen)
    // Connection points should be reversed giving (conn.toCoordinate - previousProfile[last]) as
    // the first xy point and (conn.intermediaryPoints[last] - conn.toCoordinate) as the second xy point
    // and (conn.intermediaryPoints[last - 1] - conn.intermediaryPoints[last]) as the third xy point
    const first = imported.profile[0]
    const second = imported.profile[1]
    const third = imported.profile[2]
    const inter = importedConnection.intermediaryPoints
    const last = inter.length - 1
    assert.deepStrictEqual(second, [
      r(first[0] + (r(inter[last].x) - r(importedConnection.toCoordinate.x))),
      r(first[1] + (r(inter[last].y) - r(importedConnection.toCoordinate.y))),
      second[2],
    ])
    assert.deepStrictEqual(third, [
      r(second[0] + (r(inter[last - 1].x) - r(inter[last].x))),
      r(second[1] + (r(inter[last - 1].y) - r(inter[last].y))),
      third[2],
    ])
  })

  it('should respect the noHeightSampling flag for imported connections for type default INTE-649', async function () {
    const tests = [
      { noHeightSampling: true, expectHeightSampling: false }, // default for imported connections
      { noHeightSampling: false, expectHeightSampling: true },
    ]
    for (const test of tests) {
      nock.cleanAll()
      setupPathGetterMocks({ noHeightSamplingImportedConn: test.noHeightSampling })
      const data = await exporter.exportProfiles(
        mockPath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
      )

      assert.ok(data.profiles.length)
      const imported = data.profiles.find((p) => p.id === importedConnectionId)
      assert.ok(imported)

      // Check that the exported profile coordinates reflect the height sampling
      // Checking points[1] not points[0] since first point is the socket and isn't on the sea bed
      // (first point is the fromCoordinate, second is intermediaryPoints[0])
      assert.equal(
        imported.profile[1][2],
        r(test.expectHeightSampling ? mockSeabedDepth : importedConnection.intermediaryPoints[0].z)
      )
    }
  })

  it('should ignore intermediary points for imported connections for type sampled INTE-649', async function () {
    setupPathGetterMocks()
    const data = await exporter.exportProfiles(
      mockPath, [], { profileType: 'sampled' }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)

    // We can just check the number of points as long as sampled.length != imported points length
    const importedPointsLen = importedConnection.intermediaryPoints.length + 2
    assert.notEqual(importedConnection.sampled.length, importedPointsLen)
    // Check that the sampled points were used
    assert.equal(imported.profile.length, importedConnection.sampled.length)
  })

  it('should return raw intermediary points for imported connections for type raw INTE-649', async function () {
    setupPathGetterMocks({ rawImportedConn: true })
    const data = await exporter.exportProfiles(
      mockPath, [], { profileType: 'raw' }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)

    // Checking points[1] not points[0] since first point is the socket
    // (first point is the fromCoordinate, second is intermediaryPoints[0])
    assert.equal(imported.profile[1][2], mockSurveyDepth)
    assert.equal(imported.profile[2][2], mockSurveyDepth)
  })

  it('should export intermediary points for imported connections of designType None INTE-768', async function () {
    setupPathGetterMocks({ noDesignImportedConn: true })
    const data = await exporter.exportProfiles(
      mockPath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)

    // We can just check the number of points as long as sampled.length != imported points length
    const importedPointsLen = importedConnection.intermediaryPoints.length + 2
    assert.notEqual(importedConnection.sampled.length, importedPointsLen)
    assert.equal(imported.profile.length, importedPointsLen)
  })

  it('should throw error for invalid type', async function () {
    try {
      setupPathGetterMocks()
      await exporter.exportProfiles(
        mockPath, [], { profileType: 'invalid' }, mockProjectId, mockSubProjectId
      )
      assert.fail('Expected an error for bad profileType')
    } catch (e) {
      if (!String(e).includes('Unsupported profileType')) {
        assert.fail('Error was not as expected: ' + e)
      }
    }
  })

  it('should simplify points when enabled INTE-649', async function () {
    // The test here is that simplify is included in the nock headers
    // so we are testing that the API is called with that parameter
    setupPathGetterMocks({ simplify: true })
    const data = await exporter.exportProfiles(
      mockPath, [], { simplify: true, simplifyTolerance: 1 }, mockProjectId, mockSubProjectId
    )

    assert.ok(data.profiles.length)
    // Additionally since 'simplify' in the API does not affect intermediary points
    // we need to test that intermediary points were simplified independently in the integration
    const imported = data.profiles.find((p) => p.id === importedConnectionId)
    assert.ok(imported)
    const importedPointsLen = importedConnection.intermediaryPoints.length + 2
    assert.ok(imported.profile.length < importedPointsLen)
  })

  it('should simplify well bores too', async function () {
    // Pull data without simplify
    setupPathGetterMocks({ makeVerticalBore: true })
    const data1 = await exporter.exportProfiles(
      mockPath, [], { simplify: false }, mockProjectId, mockSubProjectId
    )
    assert.ok(data1.profiles.length)
    const well1 = data1.profiles.find((p) => p.id === mockWellId)
    assert.ok(well1)

    // Pull data with simplify true
    setupPathGetterMocks({ makeVerticalBore: true, simplify: true })
    const data2 = await exporter.exportProfiles(
      mockPath, [], { simplify: true, simplifyTolerance: 1 }, mockProjectId, mockSubProjectId
    )
    assert.ok(data2.profiles.length)
    const well2 = data2.profiles.find((p) => p.id === mockWellId)
    assert.ok(well2)

    // Check initial data is what we expect
    assert.equal(well1.profile.length, 1000 / mockWellBoreGap)

    // Since 'simplify' in the API does not affect well bores
    // we need to test that well bores were simplified independently in the integration
    // we generated a straight line so it should be simplified to 2 points
    assert.equal(well2.profile.length, 2)
  })

  it('should enforce the minimum number of points INTE-666', async function () {
    // Adjust the path to contain 1 connection
    const usePath = structuredClone([mockPath[1], mockPath[2], mockPath[3]])
    const options1 = { sampleWidth: 10, minimumPoints: 20 }
    const options2 = { sampleWidth: 100, minimumPoints: 20 }

    // Test 1km connection every 10, min 20, expect 100 points
    setupPathGetterMocks({ make1kmConn1: true, sampling: 10 })
    let data = await exporter.exportProfiles(
      usePath, [], options1, mockProjectId, mockSubProjectId
    )
    assert.equal(data.profiles.length, 1)
    assert.equal(data.profiles[0].profile.length, 100)
    nock.cleanAll()

    // Now do the same every 100, which would be 10 points, but min is 20 so expect resampling at every 50 to make 20 points
    setupPathGetterMocks({ make1kmConn1: true, sampling: 100 })
    setupPathGetterMocks({ make1kmConn1: true, sampling: 50 })
    data = await exporter.exportProfiles(
      usePath, [], options2, mockProjectId, mockSubProjectId
    )
    assert.equal(data.profiles.length, 1)
    assert.equal(data.profiles[0].profile.length, 20)
  })

  it('should trim a well bore given a \'from\' parameter', async function() {
    setupPathGetterMocks()
    // Baseline test
    let usePath = structuredClone(mockPath)
    let data = await exporter.exportProfiles(
      usePath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
    )
    // First profile should be for the well NC2P1, see mockWell.activeWellBore.path,
    // going up (from the end of the bore) since the well is the start point
    let profile = data.profiles[0]
    assert.deepStrictEqual(profile.id, mockWellId)
    assert.deepStrictEqual(profile.profile.length, 3)
    assert.deepStrictEqual(profile.profile[0], [392026, 5308607, (mockWellDepth - 60)])
    assert.deepStrictEqual(profile.profile[1], [392026, 5308597, (mockWellDepth - 30)])
    assert.deepStrictEqual(profile.profile[2], [392026, 5308587, (mockWellDepth - 0)])

    const tests = [
      { depth: 30, depthType: 'MD' },
      { depth: mockWellDepth - 30, depthType: 'TVD' }, // -1202
      { depth: 1202, depthType: 'TVD' }, // should be treated the same as -1202
    ]
    for (const test of tests) {
      usePath[0].from = test
      setupPathGetterMocks()
      data = await exporter.exportProfiles(
        usePath, [], { profileType: 'default' }, mockProjectId, mockSubProjectId
      )
      profile = data.profiles[0]
      assert.deepStrictEqual(profile.id, mockWellId)
      assert.deepStrictEqual(profile.profile.length, 2)
      assert.deepStrictEqual(profile.profile[0], [392026, 5308597, (mockWellDepth - 30)])
      assert.deepStrictEqual(profile.profile[1], [392026, 5308587, (mockWellDepth - 0)])
    }
  })
})
