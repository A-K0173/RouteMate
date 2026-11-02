import { Link, useNavigate } from 'react-router-dom'
import { getToken, getUser, logout } from '../api'

function NavBar() {
  const navigate = useNavigate()
  const loggedIn = getToken()
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className="nav">
      <Link to="/trips" className="nav-title">
        RouteMate
      </Link>
      <div className="nav-right">
        {loggedIn ? (
          <>
            <span>{user ? user.name : ''}</span>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}

export default NavBar
