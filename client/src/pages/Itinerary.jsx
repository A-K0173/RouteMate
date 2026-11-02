import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DayList from '../components/DayList'
import ItineraryMap from '../components/ItineraryMap'
import { createShareLink, getItinerary, getTrip, saveItinerary } from '../tripsApi'
import { renumberStops } from '../travel'

const MAX_STOPS_PER_DAY = 6

function Itinerary() {
  const { id } = useParams()
  const [itinerary, setItinerary] = useState(null)
  const [trip, setTrip] = useState(null)
  const [days, setDays] = useState([])
  const [savedDays, setSavedDays] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    getItinerary(id)
      .then((data) => {
        setItinerary(data)
        setDays(data.days)
        setSavedDays(JSON.stringify(data.days))
        // the trip is only used for the title, so the page still works without it
        getTrip(data.tripId)
          .then((tripData) => setTrip(tripData))
          .catch(() => setTrip(null))
      })
      .catch((err) => setError(err.message))
  }, [id])

  const hasChanges = JSON.stringify(days) !== savedDays

  function handleReorder(dayNumber, newStops) {
    setMessage('')
    setDays(
      days.map((day) =>
        day.dayNumber === dayNumber ? { ...day, stops: renumberStops(newStops) } : day,
      ),
    )
  }

  function handleMove(placeId, fromDayNumber, toDayNumber) {
    setError('')
    setMessage('')
    if (fromDayNumber === toDayNumber) return

    const toDay = days.find((day) => day.dayNumber === toDayNumber)
    if (toDay.stops.length >= MAX_STOPS_PER_DAY) {
      setError('Day ' + toDayNumber + ' already has ' + MAX_STOPS_PER_DAY + ' stops')
      return
    }

    const fromDay = days.find((day) => day.dayNumber === fromDayNumber)
    const movingStop = fromDay.stops.find((stop) => stop.placeId === placeId)

    const newDays = days.map((day) => {
      if (day.dayNumber === fromDayNumber) {
        const remaining = day.stops.filter((stop) => stop.placeId !== placeId)
        return { ...day, stops: renumberStops(remaining) }
      }
      if (day.dayNumber === toDayNumber) {
        return { ...day, stops: renumberStops([...day.stops, movingStop]) }
      }
      return day
    })
    setDays(newDays)
  }

  async function handleSave() {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await saveItinerary(itinerary.id, days)
      setDays(updated.days)
      setSavedDays(JSON.stringify(updated.days))
      setMessage('Itinerary saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleUndo() {
    setError('')
    setMessage('')
    setDays(JSON.parse(savedDays))
  }

  async function handleShare() {
    setError('')
    setMessage('')
    if (hasChanges) {
      setError('Save your changes first so the share link shows them.')
      return
    }
    try {
      const data = await createShareLink(itinerary.id)
      setShareUrl(data.url)
      // copying can fail on some browsers, the link is still shown below
      try {
        await navigator.clipboard.writeText(data.url)
        setMessage('Share link copied to your clipboard.')
      } catch {
        setMessage('Share link created. Copy it from the box below.')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (!itinerary) {
    return <main className="page">{error ? <p className="error">{error}</p> : <p>Loading...</p>}</main>
  }

  return (
    <main className="page wide">
      <p>
        <Link to={'/trips/' + itinerary.tripId}>Back to trip</Link>
      </p>
      <h1>{trip ? trip.title : 'Itinerary'}</h1>
      {trip && (
        <p className="muted">
          {trip.destination} · {trip.startDate} to {trip.endDate}
        </p>
      )}

      <div className="button-row">
        <button type="button" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button type="button" className="secondary" onClick={handleUndo} disabled={!hasChanges}>
          Undo changes
        </button>
        <button type="button" className="secondary" onClick={handleShare}>
          Copy share link
        </button>
        {hasChanges && <span className="muted">You have unsaved changes</span>}
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      {shareUrl && (
        <input className="share-box" value={shareUrl} readOnly onFocus={(event) => event.target.select()} />
      )}

      <div className="itinerary-layout">
        <div className="day-column">
          <p className="muted">Drag a stop by its handle to reorder it, or pick another day to move it.</p>
          {days.map((day) => (
            <DayList
              key={day.dayNumber}
              day={day}
              allDays={days}
              onReorder={handleReorder}
              onMove={handleMove}
            />
          ))}
        </div>
        <div className="map-column">
          <ItineraryMap days={days} />
        </div>
      </div>
    </main>
  )
}

export default Itinerary
