export class APIService {
  init = false
  version = '1.10'
  backendURL = ''
  apiURL = ''
  /** @type {HeadersInit} */
  headers = {}

  constructor(backendURL) {
    if (backendURL.endsWith('/')) {
      backendURL = backendURL.slice(0, -1)
    }
    this.backendURL = backendURL
    this.apiURL = `${backendURL}/API/v${this.version}`
    this.headers = {
      Accept: 'application/json',
    }
  }

  setJWT(jwt) {
    delete this.headers['token']
    this.headers['authorization'] = 'Bearer ' + jwt
    this.init = true
  }

  setAPIToken(token) {
    delete this.headers['authorization']
    this.headers['token'] = token
    this.init = true
  }

  apiSubProjectId(subProjectId, streamId) {
    return streamId ? `${subProjectId}:${streamId}` : subProjectId
  }

  /**
   * API call to retrieve a project
   * @param {string} projectId the ID of the project to retrieve
   * @param {boolean} basic whether to retrieve only the basic project data
   * @returns {Promise<any>} API response data
   * @throws {Error} if the API call fails
   */
  async getProject(projectId, basic) {
    const url = `${this.apiURL}/${projectId}${basic ? '/basic' : ''}`
    return this._httpMethod('GET', url)
  }

  /**
   * API call to retrieve a connection instance, optionally with a sampled profile
   * @param {string} projectId project ID to query
   * @param {string} subProjectId subproject ID to query
   * @param {string|undefined} streamId optional subproject branch ID to query
   * @param {string} connectionId connection ID to load
   * @param {number} [sampleEvery] optional profile sampling distance
   * @param {boolean} [simplify] whether to simplify the sampled profile
   * @param {number} [simplifyTolerance] simplification tolerance (required when simplifying)
   * @param {boolean} [rawIntermediary] for imported connections whether to return the original intermediary points (ignoring noHeightSampling)
   * @returns {Promise<any>} the connection object
   * @throws {Error} if the API call fails
   */
  async getConnection(projectId, subProjectId, streamId, connectionId, sampleEvery, simplify, simplifyTolerance, rawIntermediary) {
    const headers = structuredClone(this.headers)
    if (sampleEvery) {
      headers['sample-every'] = sampleEvery
    }
    if (simplify) {
      headers['simplify'] = 'true'
      headers['simplify-tolerance'] = simplifyTolerance
    }
    if (rawIntermediary) {
      headers['raw-intermediary'] = 'true'
    }
    const url = `${this.apiURL}/${projectId}/subProject/${this.apiSubProjectId(subProjectId, streamId)}/connection/${connectionId}`
    return this._httpMethod('GET', url, undefined, headers)
  }

  /**
   * API call to retrieve a well instance
   * @param {string} projectId project ID to query
   * @param {string} subProjectId subproject ID to query
   * @param {string|undefined} streamId optional subproject branch ID to query
   * @param {string} wellId well ID to load
   * @returns {Promise<any>} the well object
   * @throws {Error} if the API call fails
   */
  async getWell(projectId, subProjectId, streamId, wellId) {
    const url = `${this.apiURL}/${projectId}/subProject/${this.apiSubProjectId(subProjectId, streamId)}/well/${wellId}`
    return this._httpMethod('GET', url)
  }

  /**
   * Invokes a height sample call to get the depth of an object according to the bathymetry
   * @param {string} projectId project ID to query
   * @param {string} subProjectId subproject ID to query
   * @param {string|undefined} streamId optional subproject branch ID to query
   * @param {any} obj the object to height sample, requires x and y properties
   * @returns {Promise<number>} the object's depth (as a positive number) in the project CRS unit
   * @throws {Error} if the API call fails
   */
  async getObjectDepth(projectId, subProjectId, streamId, obj) {
    const result = await this.heightSamples(
      projectId,
      subProjectId,
      streamId,
      [{ x: obj.x, y: obj.y }]
    )
    return Math.abs(result[0])
  }

  /**
   * API call to request depths for an array of {x,y} points
   * @param {string} projectId project ID to query
   * @param {string} subProjectId subproject ID to query
   * @param {string|undefined} streamId optional subproject branch ID to query
   * @param {Array<{x,y}>} points list of {x,y} coordinates to height sample
   * @returns {Promise<Array<number>>} matching list of depths
   * @throws {Error} if the API call fails
   */
  async heightSamples(projectId, subProjectId, streamId, points) {
    const url = `${this.apiURL}/${projectId}/subProject/${this.apiSubProjectId(subProjectId, streamId)}/heightSamples`
    const response = await this._httpMethod('POST', url, { points })
    return response.depths || []
  }

  /**
   * Makes an HTTP request for JSON data using fetch
   * @param {string} method 'GET', 'POST', 'PUT', etc
   * @param {string} url
   * @param {object} [data]
   * @param {HeadersInit} [headers]
   * @returns {Promise<any>} the parsed response object when response.ok is true
   * @throws {Error} an error message when response.ok is false
   */
  async _httpMethod(method, url, data, headers) {
    if (!this.init) {
      throw new Error('_httpMethod(): setJWT or setAPIToken must be called first')
    }
    const params = {
      method,
      headers: headers || this.headers,
    }
    if (data) {
      params.headers['Content-Type'] = 'application/json'
      params.body = JSON.stringify(data)
    }
    let response = null
    try {
      response = await fetch(url, params)
    } catch (err) {
      throw new Error(`API call failed with network error: ${err}`)
    }
    if (!response.ok) {
      let errObj = null, errMsg = response.statusText
      try { errObj = await response.json() } catch (err) {}
      if (errObj !== null) {
        if (typeof errObj.error === 'string') { errMsg = errObj.error }
        else if (errObj.error?.reason) { errMsg = errObj.error.reason }
        else { errMsg = JSON.stringify(errObj) }
      }
      /** @type {Error & any} */
      const err = new Error(`API call failed with status ${response.status}: ${errMsg}`)
      err.error = errObj
      throw err
    }
    return response.json()
  }
}
