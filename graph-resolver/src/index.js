import { generateGraph, generateDisplayPathsFromGraph } from "./graph.js"

/**
 * @typedef {import('../types/index.ts').Path} Path
 */

/**
 * Searches for paths from a point or between two items in a preloaded subproject.
 * @param {any} subProject the object returned from FieldTwin API GET /<projectId>/subProject/<subProjectId>
 * @param {string} startId starting point as the ID of a staged asset or well in the subproject
 * @param {string} [endId] optional ending point as the ID of a staged asset or well in the subproject
 * @param {string|number} [categoryId] optional category ID to filter connections
 * @returns {Array<Path>} an array of possible paths, each path consisting of an array of PathItems
 */
export function findPaths(subProject, startId, endId, categoryId) {
  if (!subProject || !startId) {
    throw new Error("Required parameter missing: subProject, startId")
  }

  const graph = generateGraph(subProject, startId, endId, categoryId)
  if (graph) {
    return generateDisplayPathsFromGraph(subProject, graph, endId)
  }
  return []
}
