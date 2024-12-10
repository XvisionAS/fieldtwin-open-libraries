# Profile tools

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
