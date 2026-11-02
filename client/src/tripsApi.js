import { apiFetch, USE_MOCK } from './api'
import { mockItinerary, mockPlaces, mockTrips } from './mockData'
import { countTripDays, renumberStops } from './travel'

// every page gets its data from these functions
// while USE_MOCK is true they use the fake data, so the pages work without the backend

// fake "database" saved in localStorage so it survives a page refresh
// to start over, run localStorage.removeItem('mockDb') in the browser console
function loadFakeDb() {
  const text = localStorage.getItem('mockDb')
  if (text) {
    return JSON.parse(text)
  }
  return {
    trips: mockTrips,
    places: { 4: mockPlaces, 5: [] },
    itineraries: { 1: mockItinerary },
    nextId: 100,
  }
}

const fakeDb = loadFakeDb()
const fakeTrips = fakeDb.trips
const fakePlaces = fakeDb.places
const fakeItineraries = fakeDb.itineraries

function saveFakeDb() {
  localStorage.setItem('mockDb', JSON.stringify(fakeDb))
}

function newId() {
  fakeDb.nextId = fakeDb.nextId + 1
  return fakeDb.nextId
}

const fakeSearchResults = [
  { name: 'Akihabara', address: 'Chiyoda, Tokyo', lat: 35.6984, lng: 139.7731 },
  { name: 'Tsukiji Outer Market', address: 'Chuo, Tokyo', lat: 35.6655, lng: 139.7707 },
  { name: 'Harajuku Takeshita Street', address: 'Shibuya, Tokyo', lat: 35.6716, lng: 139.7031 },
  { name: 'Odaiba Seaside Park', address: 'Minato, Tokyo', lat: 35.6298, lng: 139.7745 },
  { name: 'Tokyo Imperial Palace', address: 'Chiyoda, Tokyo', lat: 35.6852, lng: 139.7528 },
  { name: 'Fushimi Inari Taisha', address: 'Fushimi, Kyoto', lat: 34.9671, lng: 135.7727 },
  { name: 'Kinkaku-ji', address: 'Kita, Kyoto', lat: 35.0394, lng: 135.7292 },
  { name: 'Arashiyama Bamboo Grove', address: 'Ukyo, Kyoto', lat: 35.017, lng: 135.6713 },
  { name: 'Kiyomizu-dera', address: 'Higashiyama, Kyoto', lat: 34.9949, lng: 135.785 },
  { name: 'Nijo Castle', address: 'Nakagyo, Kyoto', lat: 35.0142, lng: 135.7482 },
]

function wait() {
  return new Promise((resolve) => setTimeout(resolve, 200))
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

export async function getTrips() {
  if (USE_MOCK) {
    await wait()
    return copy(fakeTrips)
  }
  return apiFetch('/trips')
}

export async function createTrip(trip) {
  if (USE_MOCK) {
    await wait()
    const newTrip = { ...trip, id: newId(), itineraryId: null }
    fakeTrips.push(newTrip)
    fakePlaces[newTrip.id] = []
    saveFakeDb()
    return copy(newTrip)
  }
  return apiFetch('/trips', { method: 'POST', body: JSON.stringify(trip) })
}

// returns the trip with its places list
export async function getTrip(tripId) {
  if (USE_MOCK) {
    await wait()
    const trip = fakeTrips.find((item) => item.id === Number(tripId))
    if (!trip) throw new Error('Trip not found')
    return copy({ ...trip, places: fakePlaces[trip.id] || [] })
  }
  return apiFetch('/trips/' + tripId)
}

export async function searchPlaces(query) {
  if (USE_MOCK) {
    await wait()
    const text = query.toLowerCase()
    return fakeSearchResults.filter(
      (place) =>
        place.name.toLowerCase().includes(text) || place.address.toLowerCase().includes(text),
    )
  }
  return apiFetch('/places/search?q=' + encodeURIComponent(query))
}

export async function addPlace(tripId, place) {
  if (USE_MOCK) {
    await wait()
    const newPlace = { id: newId(), name: place.name, address: place.address, lat: place.lat, lng: place.lng }
    fakePlaces[tripId].push(newPlace)
    saveFakeDb()
    return copy(newPlace)
  }
  return apiFetch('/trips/' + tripId + '/places', { method: 'POST', body: JSON.stringify(place) })
}

export async function removePlace(tripId, placeId) {
  if (USE_MOCK) {
    await wait()
    fakePlaces[tripId] = fakePlaces[tripId].filter((place) => place.id !== placeId)
    saveFakeDb()
    return {}
  }
  return apiFetch('/places/' + placeId, { method: 'DELETE' })
}

export async function generateItinerary(tripId) {
  if (USE_MOCK) {
    await wait()
    const trip = fakeTrips.find((item) => item.id === Number(tripId))
    const places = fakePlaces[trip.id]
    if (places.length === 0) throw new Error('Add places to the trip first')

    // the real server groups by distance, the mock just splits the list evenly
    const numDays = countTripDays(trip.startDate, trip.endDate)
    const perDay = Math.ceil(places.length / numDays)
    const days = []
    for (let day = 1; day <= numDays; day++) {
      const chunk = places.slice((day - 1) * perDay, day * perDay)
      const stops = chunk.map((place) => ({
        placeId: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
      }))
      days.push({ dayNumber: day, stops: renumberStops(stops) })
    }

    const itinerary = { id: newId(), tripId: trip.id, days }
    fakeItineraries[itinerary.id] = itinerary
    trip.itineraryId = itinerary.id
    saveFakeDb()
    return copy(itinerary)
  }
  return apiFetch('/trips/' + tripId + '/itinerary', { method: 'POST' })
}

export async function getItinerary(itineraryId) {
  if (USE_MOCK) {
    await wait()
    const itinerary = fakeItineraries[itineraryId]
    if (!itinerary) throw new Error('Itinerary not found')
    return copy(itinerary)
  }
  return apiFetch('/itineraries/' + itineraryId)
}

export async function saveItinerary(itineraryId, days) {
  if (USE_MOCK) {
    await wait()
    fakeItineraries[itineraryId].days = copy(days)
    saveFakeDb()
    return copy(fakeItineraries[itineraryId])
  }
  return apiFetch('/itineraries/' + itineraryId, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  })
}

export async function createShareLink(itineraryId) {
  if (USE_MOCK) {
    await wait()
    return { url: window.location.origin + '/shared/mock-token-' + itineraryId }
  }
  return apiFetch('/itineraries/' + itineraryId + '/share', { method: 'POST' })
}
