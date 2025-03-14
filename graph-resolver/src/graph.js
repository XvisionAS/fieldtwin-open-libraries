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
 * Utility to find the parent asset ID (XT, template, etc) and socket name (if relevant)
 * associated with a well, if any.
 * @param {any} subProject a subproject object containing stagedAssets, connections, wells
 * @param {string} wellId the ID of a well in the subproject
 * @returns {{stagedAssetId: string, socketName: string|undefined}|undefined} the well's parent asset ID and socket name, or undefined
 */
const getAssetIdForWell = (subProject, wellId) => {
  let parentId = undefined, socketName = undefined
  if (wellId) {
    const assetIds = Object.keys(subProject.stagedAssets)
    // This is the reverse of what generateDisplayPathsFromGraph() does to find wells for an asset
    // Try first for asset.well
    parentId = assetIds.find((id) => subProject.stagedAssets[id].well?.id === wellId)
    if (!parentId) {
      // Try for asset.metaData[].well
      parentId = assetIds.find((id) => {
        const metaData = subProject.stagedAssets[id].metaData || []
        const wellMD = metaData.find((metaDatum) => metaDatum.well?.id === wellId)
        if (wellMD) {
          socketName = wellMD.socket
        }
        return !!wellMD
      })
    }
    if (parentId) {
      return { stagedAssetId: parentId, socketName }
    }
  }
  return undefined
}

const TRACE = true
const trace = (msg) => TRACE ? console.log(msg) : undefined
const NO_SOCKET = '_undefined_socket'

/**
 * This function will walk the topology of a subproject, outputting a tree of possible paths.
 * It starts by getting all the connections from the asset or well with id `startingId`, then:
 * - If `currentConnectionId` is defined, it means that the current call came from recursion.
 *   We need to make sure that the next recursion is on a connection that has the same `category`.
 *   We also make sure if a connection arrive at a labelled socket, the next recursion starts
 *   at a socket with the same label. Kind of mimicking internal wiring.
 * - If `currentConnectionId` is not defined, we just go through all the connections.
 * @param {any} subProject a subproject object containing stagedAssets, connections, wells
 * @param {string} startingId the id of the asset or well to start walking from
 * @param {string} [endId] the id of the asset or well to end
 * @param {string|number} [connectionCategoryId] if defined, will only traverse connection with category equal to this value
 * @param {Object} [visited] is an object[stagedAssetId][socketLabel] of already visited stagedAssets
 *                           used to avoid infinite recursion while traversing the graph
 * @param {string} [stagedAssetId] the id of the asset to walk from next (undefined for the first call)
 * @param {string} [currentConnectionId] is the connection that initiated this call (undefined for the first call)
 * @param {string} [currentSocketName] is the socket the connection arrived at on `stagedAssetId` (undefined for the first call)
 * @returns {Object|undefined} a node of the graph structure (the root node for the top level call)
 */
export const generateGraph = (
  subProject,
  startingId,
  endId = '',
  connectionCategoryId,
  visited = {},
  stagedAssetId,
  currentConnectionId,
  currentSocketName
) => {
  let startingWellId = undefined
  const initialRecursion = !stagedAssetId

  if (!stagedAssetId) {
    trace(`generateGraph(): Start`)
    // Special case - if the starting ID is a well, find the parent asset and
    // start from there. If no parent asset is found, return an empty graph.
    const well = subProject.wells[startingId]
    if (well) {
      const parentAsset = getAssetIdForWell(subProject, startingId)
      if (!parentAsset) {
        return
      }
      // Record the well ID on the node (below)
      startingWellId = startingId
      // Reset the start point and arrival socket (which can be undefined)
      startingId = parentAsset.stagedAssetId
      currentSocketName = parentAsset.socketName
    }
    // In all cases we start from an asset
    stagedAssetId = startingId
  }

  const stagedAsset = subProject.stagedAssets[stagedAssetId]
  const currentConnection = currentConnectionId && subProject.connections[currentConnectionId]
  trace(`At staged asset ${stagedAsset?.name} from connection ${currentConnection?.params?.label}`)

  if (!stagedAsset) {
    trace(`Stop: can't find asset`)
    return
  }

  // Pigging Loops don't form a path
  const assetName = (stagedAsset.asset?.name || '').toLowerCase()
  const assetCategory = (stagedAsset.asset?.category || '').toLowerCase()
  if (assetName === 'pigging loop' || assetCategory === 'pigging loop') {
    trace(`Stop: asset is a pigging loop`)
    return
  }

  // Get the socket name and label that the connection arrived at on stagedAsset
  const sockets2d = {}
  const socketsAsArray = stagedAsset.sockets2d || stagedAsset.asset.sockets2d
  for (let i = 0; i < socketsAsArray.length; ++i) {
    const s = socketsAsArray[i]
    sockets2d[s.name] = s
  }
  const internalFromSocket = sockets2d[currentSocketName]
  const internalFromSocketName = internalFromSocket?.name || NO_SOCKET
  const internalFromSocketLabel = internalFromSocket?.label || ''
  trace(`Arrived at staged asset ${stagedAsset.name} on socket name: ${internalFromSocketName}`)

  // The node object to return (if ok)
  const node = {
    wellId: startingWellId, // only when starting node is a well
    connectionFromId: currentConnectionId,
    connection: currentConnection,
    connectionName: currentConnection?.params?.label,
    stagedAssetId,
    stagedAsset,
    stagedAssetName: stagedAsset.name,
    internalFromSocketLabel,
    internalFromSocketName,
    children: [],
  }

  if (!initialRecursion && startingId === stagedAssetId) {
    // End of path, we are back at the origin, do not close the loop
    trace(`Stop: arrived back at the starting point`)
    return
  }

  if (endId && endId == stagedAssetId) {
    // End of path, stagedAssetId is endpoint
    trace(`Stop: arrived at the end point`)
    return node
  }

  // Check if we already visited this node, mark this asset + arrival socket as
  // visited so that we are sure to not start an infinite loop. This originally
  // used a boolean but this prevented parallel paths from being completed since
  // the common part of the path could only be walked once. After a long discussion
  // with Claude 3.7 we now create a recursion-specific path history to allow parallel
  // paths to continue along the common part (if they got there via different routes)
  // while still preventing infinite loops.
  const socketLabel = internalFromSocketLabel || internalFromSocketName
  const currentNodeKey = `${stagedAssetId}:${socketLabel}`
  // Init path trackers
  visited.pathHistory ||= new Set()
  visited[stagedAssetId] ||= {}
  visited[stagedAssetId][socketLabel] ||= new Set()
  // If we've already visited this node from the same branch traversal, stop
  if (visited.pathHistory.has(currentNodeKey)) {
    trace(`Stop: detected cycle back to node:socket ${currentNodeKey}`)
    return
  }
  const pathSignature = Array.from(visited.pathHistory).concat([currentNodeKey]).join(',')
  if (visited[stagedAssetId][socketLabel].has(pathSignature)) {
    trace(`Stop: arrived at node:socket ${stagedAssetId}:${socketLabel} via previously taken path`)
    return
  }
  // Mark the path that was used to get to this node
  visited[stagedAssetId][socketLabel].add(pathSignature)
  trace(`Marking as visited node:socket ${stagedAssetId}:${socketLabel}`)
  // Clone and update the path history set for this branch of recursion
  const nextPathHistory = new Set(visited.pathHistory)
  nextPathHistory.add(currentNodeKey)
  // Use the branch-specific path history for the next recursion
  const nextVisited = {
    ...visited,
    pathHistory: nextPathHistory
  }

  const connectionsAsFrom = stagedAsset.connectionsAsFrom || {}
  const connectionsAsTo = stagedAsset.connectionsAsTo || {}
  const assetConnectionIds = {
    ...connectionsAsFrom,
    ...connectionsAsTo,
  }

  const currentType = currentConnection?.definition?.category?.id
  trace(`Current connection category is ${currentType}`)

  Object.keys(assetConnectionIds).forEach((connectionId) => {
    if (connectionId === currentConnectionId) {
      return
    }
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
      // Get the departure socket on the current asset
      const internalToSocketName = stagedAsset.connectionsAsFrom[connectionId]
        ? connection.fromSocket
        : connection.toSocket
      const internalToSocket = sockets2d[internalToSocketName]
      const internalToSocketLabel = internalToSocket?.label || ''
      trace(`Looking to follow connection ${connectionId} from asset socket: ${internalToSocketName}`)

      // Here we make sure that the socket entering the staged asset and the socket leaving it
      // use the same socket label. This gives the user the possibility to define a route through
      // the staged asset even if multiple connections of the same type enter and leave it.
      // If `currentConnectionId` is undefined this is the initial recursion so the label is n/a
      // but if starting via a well on a particular socket we must only follow that socket.
      if (
        (!currentConnectionId && !startingWellId) ||
        (startingWellId && internalFromSocketName === NO_SOCKET) ||
        (startingWellId && internalToSocketName === internalFromSocketName) ||
        (currentConnectionId && internalToSocketLabel === internalFromSocketLabel)
      ) {
        // Next staged asset is connected to the other end of the connection
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
            nextVisited,
            nextStagedAssetId,
            connectionId,
            nextSocketName
          )
          if (child) {
            node.children.push(child)
          }
          trace(`Back from recursion to try the next connection on staged asset ${stagedAsset.name}`)
        }
      } else {
        trace(
          startingWellId
            ? `Ignoring connection ${connectionId} as connection socket ${internalToSocketName} does not match well socket ${internalFromSocketName}`
            : `Ignoring connection ${connectionId} as connection socket ${internalToSocketName} is labelled ${internalToSocketLabel} but we're coming from ${internalFromSocketLabel}`
        )
      }
    } else {
      trace(`Ignoring connection ${connectionId} as category does not match`)
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
            const thisPath = [
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
            ]
            displayPaths.push(thisPath)
            trace(`Generated path ${thisPath.map((item) => item.name).join(' -> ')}`)
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
      trace(`Generated path ${currentPath.map((item) => item.name).join(' -> ')}`)
    }
  }

  /** @type {Array<Path>} */
  let displayPaths = []
  trace(`generateDisplayPathsFromGraph(): Start`)
  display(graphRoot, displayPaths, [])
  trace(`Generated ${displayPaths.length} paths`)

  // If a path is a single asset, it's not a path, don't return it.
  // But if it's a single well, allow it, to use the path of the well bore.
  displayPaths = displayPaths.filter(
    (path) => path.length > 1 || (path.length == 1 && path[0].type === 'well')
  )
  trace(`After filtering single node paths have ${displayPaths.length} paths`)

  if (endId) {
    displayPaths = displayPaths.filter(path => endId == path[path.length - 1].id)
    trace(`After filtering paths for end point have ${displayPaths.length} paths`)
  }
  return displayPaths
}
