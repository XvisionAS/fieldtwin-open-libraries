/**
 * @typedef {import('@xvisionas/graph-resolver').Path} Path
 * @typedef {import('@xvisionas/graph-resolver').PathItemType} PathItemType
 * @typedef {import('@xvisionas/graph-resolver').IPathItem} IPathItem
 */

/**
 * A simple path item class
 * @implements {IPathItem}
 */
class PathItem {
  /**
   * @param {string} id the node's id
   * @param {string} name the node's name
   * @param {PathItemType} type the type e.g. well, stagedAsset
   * @param {boolean} foreign whether the node lives in a linked parent project
   * @param {string} projectId the node's project ID
   * @param {string} subProjectId the node's subproject ID
   * @param {string} streamId the node's subproject branch ID
   */
  constructor(id, name, type, foreign, projectId, subProjectId, streamId) {
    this.id = id
    this.name = name
    this.type = type
    this.isForeign = foreign
    this.projectId = projectId
    this.subProjectId = subProjectId
    this.streamId = streamId
  }
}

/**
 * Utility to return the parent asset ID (XT, template, etc) associated with a well, or undefined.
 * @param {any} subProject a subproject object containing stagedAssets, connections, wells
 * @param {string} wellId the ID of a well in the subproject
 * @returns {string|undefined} the well's parent asset ID, or undefined if none could be found
 */
const getAssetIdForWell = (subProject, wellId) => {
  if (!wellId) {
    // undefined ID would otherwise match the first asset without a well attribute
    return undefined
  }
  let parentId = undefined
  const assetIds = Object.keys(subProject.stagedAssets)
  // This is the reverse of what generateDisplayPathsFromGraph() does to find wells for an asset
  // Try first for asset.well
  parentId = assetIds.find((id) => subProject.stagedAssets[id].well?.id === wellId)
  // Else try for asset.metaData[].well
  if (!parentId) {
    parentId = assetIds.find((id) => {
      const metaData = subProject.stagedAssets[id].metaData || []
      return !!metaData.find((metaDatum) => metaDatum.well?.id === wellId)
    })
  }
  return parentId
}

const TRACE = false
const trace = (msg) => TRACE ? console.log(msg) : undefined

/**
 * This function will walk the topology of a subproject, outputting a tree of possible paths.
 * It starts by getting all the connections from the asset or well with id `startingId`, then:
 * - If `currentConnectionId` is defined, it means that the current call came from recursion.
 *   We need to make sure that the next recursion is on a connection that has the same `type`.
 *   We also make sure if a connection arrive at a labelled socket, the next recursion starts
 *   at a socket with the same label. Kind of mimicking internal wiring.
 * - If `currentConnectionId` is not defined, we just go through all the connections.
 * @param {any} subProject a subproject object containing stagedAssets, connections, wells
 * @param {string} startingId the id of the asset or well to start walking from
 * @param {string} [endId] the id of the asset or well to end
 * @param {string|number} [connectionCategoryId] if defined, will only traverse connection with category equal to this value
 * @param {Object} [visited] is an object (stagedAssetId => socketLabel => true) of all already
 *                 visited stagedAssets, this is use to avoid infinite recursion while traversing the graph
 * @param {string} [stagedAssetId] the id of the asset to walk from next (undefined for the first call)
 * @param {string} [currentConnectionId] is the connection that initiated this call (undefined for the first call)
 * @param {string} [fromConnectionSocketName] is the socket the connection arrived to on `stagedAssetId`
 * @returns {Object|undefined} the root node of the graph structure
 */
export const generateGraph = (
  subProject,
  startingId,
  endId = '',
  connectionCategoryId,
  visited = {},
  stagedAssetId,
  currentConnectionId,
  fromConnectionSocketName
) => {
  let wellId
  const initialRecursion = !stagedAssetId

  if (initialRecursion) {
    trace(`generateGraph(): Start`)
    // Special case - if the starting ID is a well, find the parent asset and
    // start from there. If no parent asset is found, return an empty graph.
    const well = subProject.wells[startingId]
    if (well) {
      const parentAssetId = getAssetIdForWell(subProject, startingId)
      if (!parentAssetId) {
        return
      }
      // Record the well ID on the node (below) and reset the start point
      wellId = startingId
      startingId = parentAssetId
    }
    // In all cases we start from an asset
    stagedAssetId = startingId
  }

  const stagedAsset = subProject.stagedAssets[stagedAssetId]
  const currentConnection =
    currentConnectionId != undefined && subProject.connections[currentConnectionId]

  trace(`At staged asset ${stagedAsset?.name} from connection ${currentConnection?.params?.label}`)

  if (!stagedAsset) {
    trace(`Stop: can't find asset`)
    return
  }
  // 'Pigging Loops' don't form a path: https://tinyurl.com/r2c26tj4
  const assetName = (stagedAsset.asset?.name || '').toLowerCase()
  const assetCategory = (stagedAsset.asset?.category || '').toLowerCase()
  if (assetName === 'pigging loop' || assetCategory === 'pigging loop') {
    trace(`Stop: asset is a pigging loop`)
    return
  }

  const node = {
    wellId, // optional, on root node only
    connectionFromId: currentConnectionId,
    connection: currentConnection,
    connectionName: currentConnection?.params?.label,
    stagedAssetId,
    stagedAsset,
    stagedAssetName: stagedAsset.name,
    internalFromSocketLabel: undefined,
    internalFromSocketName: undefined,
    children: [],
  }

  // Create an index of the sockets
  const sockets2d = {}
  const socketsAsArray = stagedAsset.sockets2d || stagedAsset.asset.sockets2d
  for (let i = 0; i < socketsAsArray.length; ++i) {
    const s = socketsAsArray[i]
    sockets2d[s.name] = s
  }
  trace(`All asset sockets are: ${JSON.stringify(sockets2d)}`)

  const internalFromSocket = sockets2d[fromConnectionSocketName]
  const internalFromSocketLabel = internalFromSocket?.label ?? ''
  const internalFromSocketName = internalFromSocket?.name
  trace(`Arrived on socket name: ${JSON.stringify(internalFromSocketName)}`)

  node.internalFromSocketLabel = internalFromSocketLabel
  node.internalFromSocketName = internalFromSocketName

  if (!initialRecursion && startingId === stagedAssetId) {
    // End of path, we are back at the origin
    trace(`Stop: arrived back at the starting point`)
    return node
  }

  if (endId && endId == stagedAssetId) {
    // End of path, stagedAssetId is endpoint
    trace(`Stop: arrived at the end point`)
    return node
  }

  // Check if we already visited this node, mark this asset + socket as visited
  // so that we are sure to not start an infinite loop
  const socketLabel = internalFromSocketLabel || internalFromSocketName || '_unknown_socket'
  visited[stagedAssetId] = visited[stagedAssetId] || {}
  if (visited[stagedAssetId][socketLabel]) {
    trace(`Stop: arrived at previously visited socket ${stagedAssetId}:${socketLabel}`)
    return
  }
  visited[stagedAssetId][socketLabel] = true
  trace(`Marking as visited socket ${stagedAssetId}:${socketLabel}`)

  const connectionsAsFrom = stagedAsset.connectionsAsFrom || {}
  const connectionsAsTo = stagedAsset.connectionsAsTo || {}
  const connections = {
    ...connectionsAsFrom,
    ...connectionsAsTo,
  }

  const currentType = currentConnection?.definition?.category?.id
  trace(`Current connection category is ${currentType}`)

  Object.keys(connections).forEach((connectionId) => {
    if (currentConnectionId !== connectionId) {
      const connection = subProject.connections[connectionId]
      if (!connection) {
        trace(`Ignoring connection ${connectionId} as it does not exist`)
        return
      }
      trace(`Connections loop: looking at connection ${connectionId} from staged asset ${stagedAsset.name}`)

      // #21 Check type with loose equality == to handle type ID: 1 connectionTypeCategory: '1'
      const categoryId = connection?.definition?.category?.id
      if (
        (!currentConnectionId || categoryId == currentType) &&
        (!connectionCategoryId || categoryId == connectionCategoryId)
      ) {
        // Take the socket on the current asset
        const internalToSocketName = stagedAsset.connectionsAsFrom[connectionId]
          ? connection.fromSocket
          : connection.toSocket
        trace(`Looking at 'to' socket name: ${JSON.stringify(internalToSocketName)}`)

        // Next staged asset is connected on the other hand of the connection
        const internalToSocket = sockets2d?.[internalToSocketName]
        const internalToSocketLabel = internalToSocket?.label ?? ''

        // Here we make sure that the sockets 'connecting' the two connections (one that arrive to the staged asset, and the one that go from it)
        // use the same socket label. This gives the user the possibility to give a route even if multiple connections follow the same path
        // if `currentConnectionId` is undefined, this is the initial recursion, so we do not care about label.
        if (!currentConnectionId || internalToSocketLabel === internalFromSocketLabel) {
          const nextStagedAssetId = stagedAsset.connectionsAsFrom[connectionId]
            ? connection.to
            : connection.from

          const nextSocketName = stagedAsset.connectionsAsFrom[connectionId]
            ? connection.toSocket
            : connection.fromSocket

          if (subProject.stagedAssets[nextStagedAssetId]) {
            trace(`Following connection ${connectionId} with category ${categoryId} to staged asset ${nextStagedAssetId} socket ${nextSocketName}`)
            const child = generateGraph(
              subProject,
              startingId,
              endId,
              connectionCategoryId,
              visited,
              nextStagedAssetId,
              connectionId,
              nextSocketName
            )
            if (child) {
              node.children.push(child)
            }
          }
        } else {
          trace(`Ignoring connection ${connectionId} as connection socket ${internalToSocketName} is ${internalToSocketLabel} but we're coming from ${internalFromSocketLabel}`)
        }
      } else {
        trace(`Ignoring connection ${connectionId} as category does not match`)
      }
    }
  })

  return node
}

/**
 * Companion function to generateGraph().
 * Generates a flat list of all possible paths within a subproject.
 * @param {any} subProject a subproject object containing stagedAssets, connections, wells
 * @param {Object} graphRoot the returned value of generateGraph()
 * @param {string} [endId] the id to endpoint asset or well which flowpath need to end on
 * @returns {Array<Path>} an array of possible paths, each path consisting of an array of PathItems
 */
export const generateDisplayPathsFromGraph = (subProject, graphRoot, endId = '') => {

  /**
   * Recursive function to populate displayPaths
   * @param {Object} node
   * @param {Array<Path>} displayPaths
   * @param {Path} currentPath
   */
  const display = (node, displayPaths, currentPath) => {
    if (!node) {
      return
    }

    // If the node is a well it is expected to be the starting point with
    // node.stagedAssetId being the associated XT/template
    let startingWell = false
    if (node.wellId) {
      const well = subProject.wells[node.wellId]
      currentPath.push(
        new PathItem(
          node.wellId,
          well.name,
          'well',
          !!well.isForeign,
          well.project || subProject.project,
          well.subProjectDocumentId || well.subProject || subProject.id,
          well.streamId || ''
        )
      )
      startingWell = true
    }

    if (node.connectionFromId) {
      // Add the connection to the current path
      const connection = subProject.connections[node.connectionFromId]
      currentPath.push(
        new PathItem(
          node.connectionFromId,
          connection.params?.label,
          'connection',
          !!connection.isForeign,
          connection.project || subProject.project,
          connection.subProjectDocumentId || connection.subProject || subProject.id,
          connection.streamId || ''
        )
      )
    }

    if (node.stagedAssetId) {
      // Add the staged asset to the current path
      const stagedAsset = subProject.stagedAssets[node.stagedAssetId]
      currentPath.push(
        new PathItem(
          node.stagedAssetId,
          stagedAsset.name,
          'stagedAsset',
          !!stagedAsset.isForeign,
          stagedAsset.project || subProject.project,
          stagedAsset.subProjectDocumentId || stagedAsset.subProject || subProject.id,
          stagedAsset.streamId || ''
        )
      )

      // If this isn't the start point, are there any associated wells that should act as end points?
      if (!startingWell) {
        const wells = []
        if (stagedAsset.well) {
          wells.push(stagedAsset.well)
        } else {
          stagedAsset.metaData?.forEach?.((metaDatum) => {
            // If the current piece of metadata has a well (or several) associated
            // with it and the node's sockets align to the well's sockets
            if (
              metaDatum.well &&
              (!node.internalFromSocketLabel ||
                node.internalFromSocketLabel === metaDatum.socket ||
                node.internalFromSocketName === metaDatum.socket)
            ) {
              wells.push(metaDatum.well)
            }
          })
        }
        wells.forEach((well) => {
          // Add a copy of the current path with each well as the end point
          const fullWell = subProject.wells[well.id]
          // #73 asset.well or metadatum.well might have been deleted
          if (fullWell) {
            displayPaths.push([
              ...currentPath,
              new PathItem(
                well.id,
                fullWell.name,
                'well',
                !!fullWell.isForeign,
                fullWell.project || subProject.project,
                fullWell.subProjectDocumentId || fullWell.subProject || subProject.id,
                fullWell.streamId || ''
              ),
            ])
          }
        })
      }
    }

    // Recursively call this function for the node's children if it has any
    if (node.children?.length) {
      node.children.forEach((child) => display(child, displayPaths, [...currentPath]))
    } else {
      // The end of the path
      displayPaths.push(currentPath)
    }
  }

  /** @type {Array<Path>} */
  let displayPaths = []
  display(graphRoot, displayPaths, [])

  // If a path is a single asset, it's not a path, don't return it.
  // But if it's a single well, allow it, to use the path of the well bore.
  displayPaths = displayPaths.filter(
    (path) => path.length > 1 || (path.length == 1 && path[0].type === 'well')
  )
  if (endId) {
    displayPaths = displayPaths.filter(path => endId == path[path.length - 1].id)
  }
  return displayPaths
}
