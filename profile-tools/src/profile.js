import { APIService } from './api.js'
import { simplify } from './simplify.js'
import { round } from './utils.js'

/**
 * @typedef {import('@xvisionas/profile-tools').Path} Path
 * @typedef {import('@xvisionas/profile-tools').Point} Point
 * @typedef {import('@xvisionas/profile-tools').WellBoreFrom} WellBoreFrom
 * @typedef {import('@xvisionas/profile-tools').MetaDataRefs} MetaDataRefs
 * @typedef {import('@xvisionas/profile-tools').ProfileOptions} ProfileOptions
 * @typedef {import('@xvisionas/profile-tools').ObjectAttribute} ObjectAttribute
 * @typedef {import('@xvisionas/profile-tools').ExportedProfile} ExportedProfile
 * @typedef {import('@xvisionas/profile-tools').ExportedProfiles} ExportedProfiles
 */

// Reduces JSON size by not going to irrelevant decimal places
const POINT_ROUND_PLACES = 4

/**
 * Class implementing methods to export profile and metadata values from FieldTwin connections and wells.
 * Call setJWT() or setAPIToken() before calling any other methods.
 */
export class ProfileExporter {
  /**
   * @param {string} backendURL for example 'https://backend.EXAMPLE.fieldtwin.com'
   */
  constructor(backendURL) {
    this.api = new APIService(backendURL)
  }

  /**
   * Sets or updates the JWT to use for API requests.
   * @param {string} jwt
   */
  setJWT(jwt) {
    this.api.setJWT(jwt)
  }

  /**
   * Sets the API token to use for API requests.
   * @param {string} token
   */
  setAPIToken(token) {
    this.api.setAPIToken(token)
  }

  /**
   * Utility to return the exported well bore for a well - 
   * which is the _active_ bore, or else the first bore, or else undefined.
   * @param {object} well a well object
   * @return {object|undefined} a well bore object or undefined
   */
  getWellExportBore(well) {
    return well.activeWellBore || well.wellBores?.[0] || undefined
  }

  /**
   * Utility to return metadata values for a well. Taken from the well's active
   * bore if it has the required metadata, otherwise from the well itself.
   * @param {object} well a well object
   * @param {MetaDataRefs} metadataIds an array of the metadata definition IDs required
   * @returns {Array} an array of attribute objects, or []
   * @throws an error for unrecoverable data mapping issues
   */
  getWellAttributes(well, metadataIds) {
    let boreAttrs, wellAttrs
    // Try the active bore or else the first bore
    const bore = this.getWellExportBore(well)
    if (bore) {
      boreAttrs = this.buildObjectAttributes(bore, metadataIds)
      if (boreAttrs.length === metadataIds.length) {
        // The bore has all the mapped metadata definitions - use these values
        return boreAttrs
      }
    }
    // Try the well as a fallback
    wellAttrs = this.buildObjectAttributes(well, metadataIds)
    if (wellAttrs.length === metadataIds.length) {
      // The well has all the mapped metadata definitions - use these values
      return wellAttrs
    }
    // Return whichever one has more, or else nothing
    if (boreAttrs?.length && (!wellAttrs.length || boreAttrs.length >= wellAttrs.length)) {
      return boreAttrs
    } else if (wellAttrs.length) {
      return wellAttrs
    }
    return []
  }

  /**
   * Utility to return the raw trajectory profile data for a well.
   * Points are relative to the well's reference level.
   * @param {object} well a well object
   * @return {Array<Point>} the trajectory profile of the well's active bore,
   *                        as an array of points or [] if no bore path is defined
   */
  getWellProfile(well) {
    const bore = this.getWellExportBore(well)
    if (bore) {
      const path = bore.path || []
      const dummyPath = path.length === 1 && path[0].x === 0 && path[0].y === 0 && path[0].z === 0
      return path.length > 0 && !dummyPath ? path : []
    }
    return []
  }

  /**
   * Adjusts the z values in an array of points from being depth-from-reference-level
   * to being offset from sea level (which is what most FieldTwin z values are).
   * Input z values can be positive or negative (they are just treated as depth).
   * Output z values are negative below sea level, 0 at sea level, positive above sea level.
   * @param {object} well the well from which to get the reference level
   * @param {Array<Point>} points the array of {x,y,z} points to adjust in-place
   * @param {Number} seafloorDepth the depth of the sea floor at the well
   */
  pointsToSeaLevel(well, points, seafloorDepth) {
    seafloorDepth = Math.abs(seafloorDepth)
    let adjustDepth = 0
    const reference = well.referenceLevel.toLowerCase()

    if (reference == 'rkb') {
      adjustDepth = well.rkb || 0
    } else if (reference == 'sea') {
      adjustDepth = 0
    } else if (reference == 'seabed') {
      adjustDepth = -seafloorDepth
    }

    // Do this even when adjustDepth=0 to get the z values as negative
    // The || 0 is to avoid -0
    points.forEach((pt) => (pt.z = (-Math.abs(pt.z) || 0) + adjustDepth))
  }

  /**
   * Trims an array of top-down points from the start to a measured depth.
   * @param {Array<Point>} points the array of {x,y,z [,depth]} points to adjust in-place
   * @param {number} md measured depth at which to stop
   */
  trimPointsToMD(points, md) {
    if (md < 0) {
      throw new Error(`Cannot trim points to negative distance: ${md}`)
    } else if (md === 0 || points.length < 2) {
      return
    }

    let distance = 0
    const dist = (p2, p1) => {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z
      return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
    }
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        distance += dist(points[i], points[i - 1])
      }
      const p = points[i]
      // FieldTwin well bores can contain MD as a `depth` attribute in the points
      // If it's present we'll trust it as being more accurate than our approximated distance
      if (p.depth) {
        if (p.depth >= md) {
          // First point beyond md
          let keepIndex = i
          // See if the preceding point is actually closer
          if (i > 0) {
            if (Math.abs(points[i - 1].depth - md) < Math.abs(p.depth - md)) {
              keepIndex = i - 1
            }
          }
          if (keepIndex < points.length - 1) {
            points.splice(keepIndex + 1)
          }
          return
        }
      } else if (distance >= md) {
        // First point beyond md
        let keepIndex = i
        // See if the preceding point is actually closer
        if (i > 0) {
          const prevDistance = distance - dist(p, points[i - 1])
          if (Math.abs(prevDistance - md) < Math.abs(distance - md)) {
            keepIndex = i - 1
          }
        }
        if (keepIndex < points.length - 1) {
          points.splice(keepIndex + 1)
        }
        return
      }
    }
  }

  /**
   * Trims an array of top-down points from the start to a vertical depth.
   * @param {Array<Point>} points the array of {x,y,z} points to adjust in-place
   * @param {number} z depth value at which to stop
   */
  trimPointsToZ(points, z) {
    if (z === 0 || points.length < 2) {
      return
    }
    // Get the last first point above z
    // (for the case of a horizontal-ish trajectory that crosses z more than once)
    let keepIndex = points.findLastIndex((p) => p.z > z)
    if (keepIndex !== -1) {
      // See if the following point is actually closer
      if (keepIndex < points.length - 1) {
        if (Math.abs(points[keepIndex + 1].z - z) < Math.abs(points[keepIndex].z - z)) {
          keepIndex = keepIndex + 1
        }
      }
      if (keepIndex < points.length - 1) {
        points.splice(keepIndex + 1)
      }
    }
  }

  /**
   * Applies the Ramer-Douglas-Peucker simplification algorithm to the provided points,
   * returning the simplified points.
   * @param {Array<Point>} points an array of {x,y,z} points
   * @param {number} tolerance the simplification tolerance
   * @returns {Array<Point>} simplified array of {x,y,z} points
   */
  simplifyPoints(points, tolerance) {
    return simplify(points, tolerance, true)
  }

  /**
   * Returns true if a connection is an imported connection.
   * @param {object} conn connection
   * @returns {boolean}
   */
  connectionIsImported(conn) {
    return conn.designType === 'Imported' || (
      Object.keys(conn.importParams || {}).length > 0
    )
  }

  /**
   * Returns true if a connection appears to hold detailed survey data.
   * @param {object} conn connection
   * @param {number} minPoints minimum number of points to consider the data set as a survey
   * @returns {boolean}
   */
  connectionIsSurvey(conn, minPoints) {
    return (
      this.connectionIsImported(conn) &&
      !!conn.noHeightSampling &&
      (conn.intermediaryPoints || []).length >= minPoints
    )
  }

  /**
   * Exports the 3D profiles and selected metadata values of connections and optionally a well bore
   * (expected to be first or last) in the provided path.
   * @param {Path} path an array of PathItem objects
   * @param {MetaDataRefs} metadataIds an array of the metadata definition IDs required
   * @param {ProfileOptions} options an object with profile export options
   * @param {string} projectId originating project ID of the path
   * @param {string} subProjectId originating subproject ID of the path
   * @param {string} [streamId] optional - originating subproject branch ID of the path
   * @returns {Promise<ExportedProfiles>} an array of profiles and metadata values for the items in the path
   * @throws {Error} if the path is not valid or on failure to call the FieldTwin API
   */
  async exportProfiles(path, metadataIds, options, projectId, subProjectId, streamId) {
    // Defaults
    metadataIds ||= []
    options ||= {}
    options.profileType ||= 'default'
    options.sampleWidth ||= 1
    options.simplifyTolerance ||= 0.1
    options.minimumPoints ||= 10
    options.minimumSurveyPoints ||= 200

    /** @type {Point|null} */
    let firstPoint = null
    /** @type {Array<ExportedProfile>} */
    const profiles = []

    const project = await this.api.getProject(projectId, true)
    const CRS = project.CRS
    const unit = project.coordinateUnits || ''

    for (let i = 0; i < path.length; i++) {
      const node = path[i]

      // Always provide connections. Only provide well bores if the bore is the first
      // thing in the path or the last thing (otherwise you would have to follow the
      // bore down and then back up again, which makes no sense).
      const useNode = node.type === 'connection' || (node.type === 'well' && (i === 0 || i === path.length - 1))
      if (!useNode) {
        continue
      }

      // Branch off to get object-specific xyz profile and attributes
      const exportObj =
        node.type === 'connection'
          ? await this._buildConn(node, i, path, metadataIds, options, projectId, subProjectId, streamId)
          : await this._buildWell(node, i, path, metadataIds, options, projectId, subProjectId, streamId)
      const { profile, attributes, label } = exportObj
      const isSimplified = node.type === 'connection' && !!options.simplify

      if (options.relativePoints) {
        // Convert the profile xy to be relative from the beginning of the start of the first profile
        profile.forEach((point) => {
          if (!firstPoint) {
            firstPoint = structuredClone(point)
            point.x = 0
            point.y = 0
          } else {
            point.x -= firstPoint.x
            point.y -= firstPoint.y
          }
        })
      }

      profiles.push({
        id: node.id,
        type: node.type,
        name: label,
        attributes,
        simplified: isSimplified,
        profile: profile.map((point) => [
          round(point.x, POINT_ROUND_PLACES),
          round(point.y, POINT_ROUND_PLACES),
          round(point.z, POINT_ROUND_PLACES),
        ]),
      })
    }

    return {
      projectId,
      subProjectId,
      streamId,
      CRS: options.relativePoints ? undefined : CRS,
      unit,
      profiles,
    }
  }

  // Component of exportProfiles()
  async _buildConn(node, nodeIdx, path, metadataIds, options, projectId, subProjectId, streamId) {

    const loadConnectionDefault = async (sampleWidth) => this.api.getConnection(
      projectId,
      subProjectId,
      streamId,
      node.id,
      sampleWidth || options.sampleWidth,
      options.simplify,
      options.simplifyTolerance
    )
    const loadConnectionRaw = async () => this.api.getConnection(
      projectId,
      subProjectId,
      streamId,
      node.id,
      undefined,
      undefined,
      undefined,
      true
    )

    // Default to the fully sampled XYZ profile
    let conn = await loadConnectionDefault()
    let profile = conn.sampled

    // INTE-666 Adjust sample width to ensure a minimum number of points if the connection is short
    let newSampleWidth = undefined
    if (options.sampleWidth > 1 && profile.length < options.minimumPoints) {
      newSampleWidth = Math.max(Math.floor(conn.length / options.minimumPoints), 1)
      conn = await loadConnectionDefault(newSampleWidth)
      profile = conn.sampled
    }

    // Different profile options for imported connections
    if (this.connectionIsImported(conn)) {
      switch (options.profileType) {
        case 'default':
        case 'sampled':
          // v2.0 Use the fully sampled XYZ profile we already have.
          // For imported connections 'sampled' is based on the imported points
          // with Z from the imported points when connection.noHeightSampling is true
          // or sampled from the bathymetry when connection.noHeightSampling is false.
          break
        case 'raw':
          // Use the raw original XYZ points, ignore connection.noHeightSampling
          conn = await loadConnectionRaw()
          profile = [conn.fromCoordinate].concat(conn.intermediaryPoints).concat([conn.toCoordinate])
          if (options.simplify) {
            profile = this.simplifyPoints(profile, options.simplifyTolerance)
          }
          break
        case 'keepSurvey':
          // v2.0 Use the original XYZ points if survey data, otherwise use the default
          if (this.connectionIsSurvey(conn, options.minimumSurveyPoints)) {
            profile = [conn.fromCoordinate].concat(conn.intermediaryPoints).concat([conn.toCoordinate])
            if (options.simplify) {
              profile = this.simplifyPoints(profile, options.simplifyTolerance)
            }
          }
          break
        default:
          throw new Error(`Unsupported profileType: ${options.profileType}`)
      }
    }

    // Check the connection profile direction of travel
    const prevNode = nodeIdx > 0 ? path[nodeIdx - 1] : undefined
    const nextNode = nodeIdx < path.length - 1 ? path[nodeIdx + 1] : undefined
    if (conn.from?.id === prevNode?.id && conn.to?.id === nextNode?.id) {
      // Do nothing
    } else if (conn.from?.id === nextNode?.id && conn.to?.id === prevNode?.id) {
      // Travelling to-from (rather than from-to), reverse the profile
      profile.reverse()
    } else {
      throw new Error(`Saved path is no longer valid at connection ${node.id}`)
    }

    return {
      profile,
      attributes: this.buildObjectAttributes(conn, metadataIds),
      label: conn.params?.label || '',
    }
  }

  // Component of exportProfiles()
  async _buildWell(node, nodeIdx, path, metadataIds, options, projectId, subProjectId, streamId) {
    // Get the well's trajectory profile and sample the well's depth
    const well = await this.api.getWell(projectId, subProjectId, streamId, node.id)
    const seafloorDepth = await this.api.getObjectDepth(projectId, subProjectId, streamId, well)

    let profile = this.getWellProfile(well)
    if (!profile?.length) {
      // Use the well's position as the single data point
      profile = [{ x: well.x, y: well.y, z: -seafloorDepth }]
    } else {
      // The bore path direction is expected to always be top down
      // Bore path.z also has some quirks, we can't just use it as it is
      this.pointsToSeaLevel(well, profile, seafloorDepth)
      // Insert the well's position as the first point in the bore profile
      const p1 = profile[0]
      if (p1.x !== well.x || p1.y !== well.y || Math.abs(p1.z) !== seafloorDepth) {
        profile.splice(0, 0, { x: well.x, y: well.y, z: -seafloorDepth })
      }
      // Handle optional bore trimming after conversion to sea level Z, before simplification or reversal
      if (node.from && node.from.depth) {
        if (node.from.depthType === 'MD') {
          this.trimPointsToMD(profile, node.from.depth)
        } else if (node.from.depthType === 'TVD') {
          this.trimPointsToZ(profile, -Math.abs(node.from.depth))
        }
      }
      if (options.simplify) {
        profile = this.simplifyPoints(profile, options.simplifyTolerance)
      }
      // If the well is the starting point, follow it bottom up
      if (nodeIdx === 0) {
        profile.reverse()
      }
    }

    return {
      profile,
      attributes: this.getWellAttributes(well, metadataIds),
      label: well.name || '',
    }
  }

  /**
   * Extracts the value from a FieldTwin object metaData entry
   * @param {object} metadata An entry from object.metaData
   * @returns {string|number|boolean|undefined} the metadata value, if any
   */
  getMetadataValue(metadata) {
    if (metadata.value !== undefined) {
      switch (metadata.type) {
        case 'boolean':
          return metadata.value === true || metadata.value === 'true'
        case 'choices':
          return metadata.value.customValue || metadata.value.name || ''
        case 'asset':
        case 'connection':
        case 'table':
        case 'button':
          throw new Error(`Extracting ${metadata.type} type metadata is not supported`)
        default:
          return metadata.value
      }
    }
    return metadata.type === 'boolean' ? false : undefined
  }

  /**
   * Takes the metadata from the provided FieldTwin object and returns an array of
   * attribute objects, one attribute per ID requested in the metadataIds array.
   * @param {object} fieldObj a FieldTwin object (connection or well or well bore)
   * @param {MetaDataRefs} metadataIds an array of the metadata definition IDs required
   * @returns {Array<ObjectAttribute>} an array of the resulting attributes
   */
  buildObjectAttributes(fieldObj, metadataIds) {
    const objectMD = fieldObj.metaData || []
    const attributes = []
    for (const wanted of metadataIds) {
      const metadataValue = objectMD.find((md) => {
        return (wanted.metaDatumId && md.metaDatumId === wanted.metaDatumId) ||
          (wanted.vendorId && md.vendorId === wanted.vendorId) ||
          (wanted.definitionId && md.definitionId === wanted.definitionId)
      })
      if (metadataValue) {
        const value = this.getMetadataValue(metadataValue)
        if (value !== undefined && value !== null) {
          attributes.push({
            metaDatumId: metadataValue.metaDatumId,   // always defined
            vendorId: metadataValue.vendorId,         // sometimes defined
            definitionId: metadataValue.definitionId, // sometimes defined
            name: metadataValue.name || '',
            value: value,
            unit: metadataValue.option || '',
          })
        }
      }
    }
    return attributes
  }
}