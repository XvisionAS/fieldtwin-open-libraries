# Graph resolver

## 1.1.0

13 March 2025

* Fix issue where the same connection could be followed in both directions in one path
* Fix issue with only 1 of 2 parallel paths being followed when they rejoin to share a
  common subsequent path
* Fix issue where a path starting with a well might follow connections on other sockets
  than the socket specifically attached to that well

## 1.0.0 - 1.0.1

13 June 2024

* First release
* 1.0.1 fixes the type declarations
