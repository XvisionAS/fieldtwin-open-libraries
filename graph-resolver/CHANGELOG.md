# Graph resolver

## 1.1.1

* Fix: guard against subProject, subProject.connections, subProject.wells being undefined

## 1.1.0

14 March 2025

* Change: do not generate circular paths that return to the starting point
  * Also fixes an issue where the starting connection was followed in both directions
    both away from and back to the starting point
* Fix issue with only 1 of 2 parallel paths being followed when they rejoin to share a
  common subsequent path
* Fix issue where a path starting with a well might follow connections on other sockets
  than the socket specifically assigned to that well

## 1.0.0 - 1.0.1

13 June 2024

* First release
* 1.0.1 fixes the type declarations
