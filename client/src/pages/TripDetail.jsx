import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addPlace, generateItinerary, getTrip, removePlace, searchPlaces } from '../tripsApi'
import { countTripDays } from '../travel'

function TripDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState(null)
  const [places, setPlaces] = useState([])
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    getTrip(id)
      .then((data) => {
        setTrip(data)
        setPlaces(data.places || [])
      })
      .catch((err) => setError(err.message))
  }, [id])

  async function handleSearch(event) {
    event.preventDefault()
    if (!query.trim()) return
    setError('')
    setSearching(true)
    try {
      const data = await searchPlaces(query.trim())
      setResults(data)
      setSearched(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd(result) {
    setError('')
    try {
      const newPlace = await addPlace(trip.id, result)
      setPlaces([...places, newPlace])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(placeId) {
    setError('')
    try {
      await removePlace(trip.id, placeId)
      setPlaces(places.filter((place) => place.id !== placeId))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    try {
      const itinerary = await generateItinerary(trip.id)
      navigate('/itineraries/' + itinerary.id)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  // hide search results that are already on the trip
  function alreadyAdded(result) {
    return places.some((place) => place.lat === result.lat && place.lng === result.lng)
  }

  if (!trip) {
    return <main className="page">{error ? <p className="error">{error}</p> : <p>Loading...</p>}</main>
  }

  const numDays = countTripDays(trip.startDate, trip.endDate)
  const maxPlaces = numDays * 6

  return (
    <main className="page">
      <p>
        <Link to="/trips">Back to trips</Link>
      </p>
      <h1>{trip.title}</h1>
      <p className="muted">
        {trip.destination} · {trip.startDate} to {trip.endDate} · {numDays} {numDays === 1 ? 'day' : 'days'}
      </p>
      {error && <p className="error">{error}</p>}

      <div className="two-columns">
        <section className="card">
          <h2>Search for a place</h2>
          <form onSubmit={handleSearch} className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Akihabara or Kyoto"
            />
            <button type="submit" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          {searched && results.length === 0 && <p className="muted">No places found.</p>}
          <ul className="result-list">
            {results.map((result) => (
              <li key={result.name + result.lat}>
                <div>
                  <strong>{result.name}</strong>
                  <span className="muted">{result.address}</span>
                </div>
                {alreadyAdded(result) ? (
                  <span className="muted">Added</span>
                ) : (
                  <button type="button" onClick={() => handleAdd(result)}>
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Places on this trip ({places.length})</h2>
          {places.length === 0 && <p className="muted">No places yet. Search and add some.</p>}
          <ul className="result-list">
            {places.map((place) => (
              <li key={place.id}>
                <strong>{place.name}</strong>
                <button type="button" className="secondary" onClick={() => handleRemove(place.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {places.length > maxPlaces && (
            <p className="error">
              This trip can hold at most {maxPlaces} places (6 per day). Remove some first.
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || places.length === 0 || places.length > maxPlaces}
            >
              {generating ? 'Generating...' : 'Generate itinerary'}
            </button>
            {trip.itineraryId && (
              <Link to={'/itineraries/' + trip.itineraryId}>View current itinerary</Link>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default TripDetail
