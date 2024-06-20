/**
 * Rounds a float to a number of decimal places.
 * E.g. round(1.2345, 3) --> 1.235
 * @param {Number} num The number to round
 * @param {Number} places The number of decimal places to round to
 * @return {Number} The rounded number
 */
export const round = (num, places = 0) => {
  if (isNaN(num)) {
    return num
  }

  if (String(num).includes('e')) {
    // Can't use "e" notation on top of e notation
    const multiplier = Math.pow(10, places)
    return Math.round(num * multiplier) / multiplier
  }

  // Use "e" notation instead of Math.pow() to avoid round(1.005, 2) = 1 instead of 1.01
  // Ref https://www.jacklmoore.com/notes/rounding-in-javascript/
  return Number(Math.round(num + 'e' + places) + 'e-' + places)
}
