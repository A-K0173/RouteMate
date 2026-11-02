import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dayColour } from '../dayColours'

// a round marker with the stop number in it, coloured by day
function numberIcon(number, colour) {
  return L.divIcon({
    className: '',
    html: '<div class="stop-marker" style="background:' + colour + '">' + number + '</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

// zooms the map so every stop is visible
function FitToStops({ points }) {
  const map = useMap()
  // only re-zoom when the set of places changes, not on every drag
  const placesKey = points.map((point) => point.join(',')).sort().join(';')

  useEffect(() => {
    const list = placesKey ? placesKey.split(';').map((text) => text.split(',').map(Number)) : []
    if (list.length === 1) {
      map.setView(list[0], 14)
    } else if (list.length > 1) {
      map.fitBounds(list, { padding: [30, 30] })
    }
  }, [map, placesKey])
  return null
}

function ItineraryMap({ days }) {
  const points = []
  for (const day of days) {
    for (const stop of day.stops) {
      points.push([stop.lat, stop.lng])
    }
  }

  return (
    <MapContainer center={[43.6532, -79.3832]} zoom={12} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToStops points={points} />

      {days.map((day) => (
        <Polyline
          key={'line-' + day.dayNumber}
          positions={day.stops.map((stop) => [stop.lat, stop.lng])}
          pathOptions={{ color: dayColour(day.dayNumber), weight: 4 }}
        />
      ))}

      {days.map((day) =>
        day.stops.map((stop) => (
          <Marker
            key={'stop-' + stop.placeId}
            position={[stop.lat, stop.lng]}
            icon={numberIcon(stop.order, dayColour(day.dayNumber))}
          >
            <Popup>
              <strong>{stop.name}</strong>
              <br />
              Day {day.dayNumber}, stop {stop.order}
            </Popup>
          </Marker>
        )),
      )}
    </MapContainer>
  )
}

export default ItineraryMap
