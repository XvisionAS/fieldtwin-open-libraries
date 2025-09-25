# Profile tools

## 2.0.2

* Remove any duplicate XYZ points after the numeric values have been rounded

## 2.0.0 - 2.0.1

9 July 2025

Since FieldTwin 8.1 the API returns connection profiles using a newer dynamic sampling method
that generates points with variable spacing (unlike the older "legacy" sampling that used a
fixed spacing) and more accurately tracks the terrain. This makes it suitable for use with
both designed and imported connections.

* Changed the options for `options.profileType`:
  * `default` now exports a sampled XYZ profile for all connection types
    * The XY values follow the path of the control points for designed connections,
      or the imported XY points for imported connections
    * The Z values continue to be determined by the connection's
      "connection follows bathymetry" attribute
  * `sampled` is now equivalent to `default`
  * `raw` is unchanged
  * `keepSurvey` is a new value that attempts to determine if an imported connection
    contains survey data. This is determined by "connection follows bathymetry" being
    `false` and the number of imported points being greater than `minimumSurveyPoints`.
    When survey data is detected it is exported as `raw`, else `default`.
* Added a new option for `minimumSurveyPoints` that specifies the minimum number of
  points before a data set can be considered as exportable
* 2.0.1 updates the type declarations

Users of v1 should find that v2 is a drop-in replacement, but since the default profile
data for imported connections is now sampled this is considered to be an incompatibility.


## 1.3.1

8 July 2025

* Add vendorId and definitionId to exported metadata to enable attribute
  matching when metaDatumId is different coming from an external subProject

## 1.3.0

11 December 2024

* Add support for optional `from` section for well bores in the input path
  * When set, exports the bore from that point onwards

## 1.2.1

10 December 2024

* Add `unit` to `ExportedProfiles` return value

## 1.2.0

9 December 2024

* Add `ProfileExporter.getWellExportBore()` method
* Remove use of `any` in types

## 1.1.2

16 October 2024

* Expose `ProfileExporter.connectionIsImported()` in types (no functional changes)

## 1.1.1

16 October 2024

* Fix: use `importParams` to identify imported connections when `designType` is not `Imported`
  * Compatibility: connections imported via `Import > Connections from file` were not given
    `importParams` before 2024-10-17

## 1.1.0

24 June 2024

* Add `raw` profile type

## 1.0.0 - 1.0.1

24 June 2024

* First release
* 1.0.1 fixes the type declarations
