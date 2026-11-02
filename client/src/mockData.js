// fake data so the pages can be built before the backend routes exist
// the trip shape is a guess until Aareez confirms it

export const mockTrips = [
  {
    id: 4,
    title: 'Tokyo Adventure',
    destination: 'Tokyo, Japan',
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    itineraryId: 1,
  },
  {
    id: 5,
    title: 'Weekend in Kyoto',
    destination: 'Kyoto, Japan',
    startDate: '2027-03-12',
    endDate: '2027-03-13',
    itineraryId: null,
  },
]

export const mockPlaces = [
  { id: 1, name: 'Senso-ji', lat: 35.7148, lng: 139.7967 },
  { id: 2, name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107 },
  { id: 3, name: 'Ueno Park', lat: 35.7156, lng: 139.7745 },
  { id: 4, name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993 },
  { id: 5, name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 },
  { id: 6, name: 'Shinjuku Gyoen', lat: 35.6852, lng: 139.71 },
  { id: 7, name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454 },
]

// same shape as the itinerary in the README
export const mockItinerary = {
  id: 1,
  tripId: 4,
  days: [
    {
      dayNumber: 1,
      stops: [
        { placeId: 1, name: 'Senso-ji', lat: 35.7148, lng: 139.7967, order: 1, travelMinFromPrevious: 0 },
        { placeId: 2, name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107, order: 2, travelMinFromPrevious: 15 },
        { placeId: 3, name: 'Ueno Park', lat: 35.7156, lng: 139.7745, order: 3, travelMinFromPrevious: 38 },
      ],
    },
    {
      dayNumber: 2,
      stops: [
        { placeId: 4, name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993, order: 1, travelMinFromPrevious: 0 },
        { placeId: 5, name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005, order: 2, travelMinFromPrevious: 25 },
      ],
    },
    {
      dayNumber: 3,
      stops: [
        { placeId: 6, name: 'Shinjuku Gyoen', lat: 35.6852, lng: 139.71, order: 1, travelMinFromPrevious: 0 },
        { placeId: 7, name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454, order: 2, travelMinFromPrevious: 50 },
      ],
    },
  ],
}
