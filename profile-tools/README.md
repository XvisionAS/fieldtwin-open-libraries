# Profile tools

This utility builds on [graph-resolver](../graph-resolver/) to:

* Export a 3D profile of a route (well bore and connection profiles)
* Export metadata values for well bores and connections along a route

The primary use case for this is to integrate FieldTwin with flow assurance tools and simulators.
It could also be used to export flow paths into another 3D viewer, geospatial or mapping system.

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
  "profiles": [
    {
      "id": "-MZCqmEqvokERuFWlVoT",
      "type": "connection",
      "name": "Oil Production #4",
      "attributes": [
        {
          "metaDatumId": "-N68U9EWYziLs9D84qXJ",
          "name": "Inner Diameter",
          "value": 16,
          "unit": "in"
        },
        {
          "metaDatumId": "-N68U9EWYziLs9D84qXL",
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
          "metaDatumId": "-N68U9EWYziLs9D84qXJ",
          "name": "Inner Diameter",
          "value": 16,
          "unit": "in"
        },
        {
          "metaDatumId": "-N68U9EWYziLs9D84qXL",
          "name": "Wall Thickness",
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

* `profileType` - how to handle imported connections
  * `default` - output the original XYZ points when "connection follows bathymetry" is false,
    output the original XY points and a height sampled Z when "connection follows bathymetry" is true
  * `sampled` - generate a profile the same as for non-imported connections with points at the `sampleWidth` interval
* `sampleWidth` - the interval of points generated for non-imported connections
  * default `1`, minimum `1` (provides a point every 1 foot/meter along each connection)
* `minimumPoints` - the minimum number of points required in a generated profile
  * default `10`
  * overrides `sampleWidth` when the generated number of points is too low
* `relativePoints` - whether to start the first point of the first profile at XY 0,0 and provide
   all other points as offsets from it
  * default `false` (keep the XYZ locations as shown in FieldTwin, valid for the CRS of the project)
  * the returned CRS is blank when `relativePoints` is `true`
* `simplify` - whether to apply the [Ramer–Douglas–Peucker algorithm](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm)
  to the exported profiles to remove points that fall in a straight line
  * default `false`
* `simplifyTolerance` - when `simplify` is `true`, a sequence of points that varies in horizontal/vertical
  distance by less than this value will be considered a straight line and removed
  * default `0.1`, minimum `0.01`
  * setting a larger tolerance remove more points

### Notes

* The 3D profile is provided as an array of array[3] where the latter is XYZ format
  (northing, easting, height from sea level)
* As simplification happens last it is possible that a simplified profile will contain fewer points
  than the `minimumPoints` value
