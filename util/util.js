import { findPaths } from '@xvisionas/graph-resolver'
import { ProfileExporter } from '@xvisionas/profile-tools'

// Provide either an API token OR a JWT
const API_TOKEN = process.env.API_TOKEN || '<YOUR-TOKEN>'
const JWT = ''
const authHeaders = API_TOKEN ? { 'Token': API_TOKEN } : { 'Authorization': `Bearer ${JWT}` }

// This information can be obtained from the JWT if you have one
const backendHostname = process.env.BACKEND || 'backend.<EXAMPLE>.fieldtwin.com'
const projectId = '-M-HHqMifhz6qskW2goc'
let subProjectId = '-MWZBqfmyxgQ46p_dlg1'

// Optional branch in FieldTwin 8.0+
const streamId = ''
if (streamId) {
  subProjectId = `${subProjectId}:${streamId}`
}

// Make the API call to load the subproject
const response = await fetch(`https://${backendHostname}/API/v1.10/${projectId}/subProject/${subProjectId}`, {
  method: 'GET',
  headers: authHeaders
})
if (!response.ok) {
  throw new Error(`Failed to load subproject: ${response.status} ${response.statusText}`)
}
const subProject = await response.json()

// Start/End points need to be a valid ID in subProject.stagedAssets or subProject.wells
// Normally these would come from a UI in your integration - maybe the value of a <select> element
// or by listening for the 'select' event sent by FieldTwin and asking the user to click on an object
const startPoint = '-MZCqjqwbDZQ9XTD5I5P'
const endPoint = '-MWymjRPAoVVdClV08ba'

// Category is optional
// If provided it needs to be a valid value in one of subProject.connectionTypes[].category
const connectionCategory = 264

const paths = findPaths(subProject, startPoint, endPoint, connectionCategory)
console.log(`Found ${paths.length} path(s)`)
console.log(JSON.stringify(paths, null, 2))


if (paths.length > 0) {
  const exporter = new ProfileExporter(`https://${backendHostname}`)
  if (API_TOKEN) {
    exporter.setAPIToken(API_TOKEN)
  } else {
    exporter.setJWT(JWT)
  }
  console.log(`\n\nExport of paths[0]...`)
  const profiles = await exporter.exportProfiles(paths[0], [], { profileType: 'default', relativePoints: true, simplify: true }, projectId, subProjectId)
  console.log(JSON.stringify(profiles, null, 2))
}
