# Profile tools

This utility builds on [graph-resolver](../graph-resolver/) to:

* Export a 3D profile of a route (well bore and connection profiles)
* Export metadata values for well bores and connections along a route

The primary use case for this is to integrate FieldTwin with flow assurance tools and simulators.
It could also be used to export flow paths into another 3D viewer, geospatial or mapping system.

The current version is v2.x. You can find the README for v1.x [here](./legacy/README_1.x.md).
Major changes are described in the [CHANGELOG](./CHANGELOG.md).

## Compatibility

FieldTwin API v1.10.

## Usage

```js
import { ProfileExporter } from '@xvisionas/profile-tools'

// Provide either an API token OR a JWT
const API_TOKEN = '<YOUR-TOKEN>'
const JWT = ''

// This information can be obtained from the JWT if you have one
const backendHostname = 'backend.<EXAMPLE>.fieldtwin.com'
const projectId = '-M-HHqMifhz6qskW2goc'
const subProjectId = '-MWZBqfmyxgQ46p_dlg1'

// Sample output from graph-resolver
const path = [
    {
        "id": "-MZCqjqwbDZQ9XTD5I5P",
        "name": "Manifold #3",
        "type": "stagedAsset"
    },
    {
        "id": "-MZCqmEqvokERuFWlVoT",
        "name": "Oil Production #4",
        "type": "connection"
    },
    {
        "id": "-MWxVs0DTt3wspEFwKhR",
        "name": "Manifold #1",
        "type": "stagedAsset"
    },
    {
        "id": "-MWxVuRkprTblYFOExDD",
        "name": "Oil Production #3",
        "type": "connection"
    },
    {
        "id": "-MWymjRPAoVVdClV08ba",
        "name": "Template 2 slot #1",
        "type": "stagedAsset"
    }
]

// Construct an exporter
const exporter = new ProfileExporter(`https://${backendHostname}`)
if (API_TOKEN) {
  exporter.setAPIToken(API_TOKEN)
} else {
  exporter.setJWT(JWT)
}

// Export the profiles of the connections in the path
const data1 = await exporter.exportProfiles(path, [], {}, projectId, subProjectId)
console.log('Default export')
console.log(JSON.stringify(data1, null, 2))

// Or export the profiles and metadata values of the connections in the path
const wantedMetadata = [
    { "vendorId": "Std.InnerDiameter" },
    { "vendorId": "Std.WallThickness" },
    { "vendorId": "Std.HydraulicRoughness" }
]
const data2 = await exporter.exportProfiles(path, wantedMetadata, {}, projectId, subProjectId)
console.log('Export with selected metadata')
console.log(JSON.stringify(data2, null, 2))

// Optionally reduce the data sizes by simplifying the profiles
const options = {
    "simplify": true,
    "simplifyTolerance": 0.1
}
const data3 = await exporter.exportProfiles(path, wantedMetadata, options, projectId, subProjectId)
console.log('Simplified export with metadata')
console.log(JSON.stringify(data3, null, 2))
```

Example output:

```json
{
  "projectId": "-M-HHqMifhz6qskW2goc",
  "subProjectId": "-MWZBqfmyxgQ46p_dlg1",
  "CRS": "EPSG:23032",
  "unit": "m",
  "profiles": [
    {
      "id": "-MZCqmEqvokERuFWlVoT",
      "type": "connection",
      "name": "Oil Production #4",
      "attributes": [
        {
          "definitionId": "FutureOnMetadata:Std.InnerDiameter[numerical.Length.Short Length]",
          "metaDatumId": "-N68U9EWYziLs9D84qXJ",
          "name": "Inner Diameter",
          "vendorId": "Std.InnerDiameter",
          "value": 16,
          "unit": "in"
        },
        {
          "definitionId": "FutureOnMetadata:Std.WallThickness[numerical.Length.Short Length]",
          "metaDatumId": "-N68U9EWYziLs9D84qXL",
          "vendorId": "Std.WallThickness",
          "name": "Wall Thickness",
          "value": 27,
          "unit": "mm"
        }
      ],
      "simplified": true,
      "profile": [
        [
          -68.9537,
          96.0668,
          -197.3579
        ],
        [
          -66.0245,
          100.9405,
          -199.3195
        ],
        [
          -64.5114,
          103.4579,
          -199.9586
        ],
        ...
      ]
    },
    {
      "id": "-MWxVuRkprTblYFOExDD",
      "type": "connection",
      "name": "Oil Production #3",
      "attributes": [
        {
          "definitionId": "FutureOnMetadata:Std.InnerDiameter[numerical.Length.Short Length]",
          "metaDatumId": "-N68U9EWYziLs9D84qXJ",
          "name": "Inner Diameter",
          "vendorId": "Std.InnerDiameter",
          "value": 16,
          "unit": "in"
        },
        {
          "definitionId": "FutureOnMetadata:Std.WallThickness[numerical.Length.Short Length]",
          "metaDatumId": "-N68U9EWYziLs9D84qXL",
          "name": "Wall Thickness",
          "vendorId": "Std.WallThickness",
          "value": 27,
          "unit": "mm"
        }
      ],
      "simplified": true,
      "profile": [
        [
          31.1253,
          132.4246,
          -197.3415
        ],
        [
          28.2805,
          127.5275,
          -199.3391
        ],
        [
          26.8056,
          124.9886,
          -199.9534
        ],
        ...
      ]
    }
  ]
}
```

### Options

The following attributes are supported in the `options` object.
All attributes are optional.

* `profileType` - How to export the profiles of imported connections
  * `default` - As shown in FieldTwin
    * Generates a sampled XYZ profile for all connection types,
      with points spaced approximately at the `sampleWidth` interval
    * XY values follow the path of the control points for designed connections,
      or the imported XY points for imported connections
    * Z values are determined by the connection's "connection follows bathymetry"
      attribute (sampled from the bathymetry when `true`, taken from the imported points when `false`)
  * `sampled` - This is now equivalent to `default`
  * `raw` - Export the original XYZ points unchanged
    * Ignores the "connection follows bathymetry" attribute and does not resample any points
  * `keepSurvey` - Export as `raw` for survey data, otherwise `default`
    * Survey data is identified by an imported connection having "connection follows bathymetry"
      as `false` and the number of imported points being equal to or greater than `minimumSurveyPoints`
* `sampleWidth` - The approximate interval of points to generate in the XYZ profile
  * Default `1`, minimum `1` (provides a point every 1 foot/meter along each connection)
* `minimumPoints` - The minimum number of points required in a generated XYZ profile
  * Default `10`
  * Overrides `sampleWidth` when the generated number of points is too low
* `minimumSurveyPoints` - When `profileType` is `keepSurvey`, the minimum number of points
  an imported connection must have before it can be considered to contain survey data
  * Default `200`
* `relativePoints` - Whether to export the first point of the first profile at X,Y 0,0
  and provide all other points as offsets from it
  * Default `false` (keep the XYZ locations as shown in FieldTwin, valid for the CRS of the project)
  * The returned CRS is blank when `relativePoints` is `true`
* `simplify` - Whether to apply the [Ramer–Douglas–Peucker algorithm](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm)
  to the exported profiles to remove points that fall in a straight line
  * Default `false`
* `simplifyTolerance` - When `simplify` is `true`, a sequence of points that varies in horizontal
  or vertical distance by less than this value will be considered a straight line and removed
  * Default `0.1`, minimum `0.01`
  * Setting a larger tolerance removes more points

### Notes

* The 3D profile is provided as an array of `number[3]` where the latter is XYZ format
  (northing, easting, height from sea level)
* The returned `unit` is blank if the FieldTwin project does not have a
  [CRS](https://design.fieldtwin.com/dashboard/#map-settings) or unit system defined
* As simplification happens last it is possible that a simplified profile will contain fewer points
  than the `minimumPoints` value
* If the input path contains a well (`"type": "well"`) it must be the first or last item in the path
  * Only one well bore is supported
  * If the well contains multiple well bores, the _active_ bore is exported
  * If no bore is marked as _active_, the first bore is exported
* All exported `z` (depth) values are relative to sea level
  * In particular, `z` values stored in the well bore path are converted from initially
    being relative to the well's _reference level_

## Well bore trimming

In the case where FieldTwin holds the full drilling path of a well bore but not all of that
path is relevant for flow assurance, an optional `from` object can be added to the input data.
This could be set to the location of the top or bottom perforation, for example. It is specified
as a depth value and how to interpret the depth (as MD or TVD from sea level).

When a `from` location is set, the exported profile will begin from the point in the well bore
path closest to that location.

Example input:

```js
const path = [
    {
        "id": "-ODozhGETDrNsJHizWz2",
        "name": "F-15B",
        "type": "well",
        "from": {
          "depth": 1580,
          "depthType": "MD"
        }
    },
    {
        "id": "-ODp-5sJSKhWLaqP-UFa",
        "name": "F-15B-XMT-A",
        "type": "stagedAsset"
    },
    {
        "id": "-ODpXJ2JgvnyaY4GP3nh",
        "name": "Oil Production Spool #18",
        "type": "connection"
    },
    {
        "id": "-ODpXJL12SserOx59Hv3",
        "name": "Manifold #7",
        "type": "stagedAsset"
    }
]
```

* `from` is only supported on path items of type `well`
* The `depth` value must be provided in the project unit (meters or feet)
* If `depthType` is `MD`, this indicates measured depth from the top of the well
  and is always a positive number
* If `depthType` is `TVD`, this indicates vertical depth from sea level,
  **not** vertical depth from the well or from the well's _reference level_
