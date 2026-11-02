import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createTrip, getTrips } from '../tripsApi'

function Trips() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getTrips()
      .then((data) => setTrips(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    setError('')

    if (endDate < startDate) {
      setError('End date must be on or after the start date')
      return
    }

    setSaving(true)
    try {
      const newTrip = await createTrip({ title, destination, startDate, endDate })
      setTrips([...trips, newTrip])
      setTitle('')
      setDestination('')
      setStartDate('')
      setEndDate('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <h1>My Trips</h1>
      {error && <p className="error">{error}</p>}

      <div className="two-columns">
        <section className="card">
          <h2>Your trips</h2>
          {loading && <p>Loading...</p>}
          {!loading && trips.length === 0 && <p>No trips yet. Create one to get started.</p>}
          <ul className="trip-list">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link to={'/trips/' + trip.id}>
                  <strong>{trip.title}</strong>
                  <span>{trip.destination}</span>
                  <span className="muted">
                    {trip.startDate} to {trip.endDate}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Create a trip</h2>
          <form onSubmit={handleCreate} className="form">
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Destination
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Tokyo, Japan"
                required
              />
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create trip'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default Trips
