import { Navigate, Route, Routes } from 'react-router-dom'
import { getToken } from './api'
import NavBar from './components/NavBar'
import Itinerary from './pages/Itinerary'
import Login from './pages/Login'
import Register from './pages/Register'
import SharedItinerary from './pages/SharedItinerary'
import TripDetail from './pages/TripDetail'
import Trips from './pages/Trips'
import './App.css'

// pages that need a login send you to /login if there is no token
function RequireLogin({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/trips" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/shared/:token" element={<SharedItinerary />} />
        <Route
          path="/trips"
          element={
            <RequireLogin>
              <Trips />
            </RequireLogin>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <RequireLogin>
              <TripDetail />
            </RequireLogin>
          }
        />
        <Route
          path="/itineraries/:id"
          element={
            <RequireLogin>
              <Itinerary />
            </RequireLogin>
          }
        />
      </Routes>
    </>
  )
}

export default App
