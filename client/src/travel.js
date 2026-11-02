// same math as server/src/itinerary/distance.js so the numbers match the generator
const WALKING_SPEED_KMH = 4.5

function toRad(degrees) {
  return (degrees * Math.PI) / 180
}

export function haversineKm(a, b) {
  const earthRadiusKm = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function travelMinutes(a, b) {
  return Math.round((haversineKm(a, b) / WALKING_SPEED_KMH) * 60)
}

// after a drag or a move, give the stops 1, 2, 3... and fresh travel times
export function renumberStops(stops) {
  const newStops = []
  for (let i = 0; i < stops.length; i++) {
    let minutes = 0
    if (i > 0) {
      minutes = travelMinutes(stops[i - 1], stops[i])
    }
    newStops.push({ ...stops[i], order: i + 1, travelMinFromPrevious: minutes })
  }
  return newStops
}

export function dayTotalMinutes(stops) {
  let total = 0
  for (const stop of stops) {
    total += stop.travelMinFromPrevious
  }
  return total
}

// number of days from start to end, counting both days (same as the server)
export function countTripDays(startDate, endDate) {
  const start = Date.parse(startDate + 'T00:00:00Z')
  const end = Date.parse(endDate + 'T00:00:00Z')
  return Math.floor((end - start) / 86400000) + 1
}
