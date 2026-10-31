import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

export default function SharedItinerary() {
  const { token } = useParams()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/shared/${token}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load itinerary')
        if (!cancelled) setState({ status: 'ready', itinerary: body })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: error.message })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p>{state.message}</p>

  const { itinerary } = state
  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', textAlign: 'left' }}>
      <h1>{itinerary.title}</h1>
      <p>
        {itinerary.destination} · {itinerary.startDate} to {itinerary.endDate}
      </p>
      <p>
        <small>
          Read-only link, expires {new Date(itinerary.expiresAt).toLocaleString()}
        </small>
      </p>
      {itinerary.days.map((day) => (
        <section key={day.dayNumber}>
          <h2>Day {day.dayNumber}</h2>
          {day.stops.length === 0 ? (
            <p>No stops planned.</p>
          ) : (
            <ol>
              {day.stops.map((stop) => (
                <li key={stop.order}>
                  {stop.name}
                  {stop.travelMinFromPrevious > 0 &&
                    ` (${stop.travelMinFromPrevious} min from previous)`}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
      {}
    </main>
  )
}
