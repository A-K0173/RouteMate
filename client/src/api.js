// set to false when the trips and places routes are merged on the backend
export const USE_MOCK = true

export function getToken() {
  return localStorage.getItem('token')
}

export function getUser() {
  const text = localStorage.getItem('user')
  return text ? JSON.parse(text) : null
}

export function saveLogin(token, user) {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

// every api call goes through here so the token is always sent
export async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers.Authorization = 'Bearer ' + token
  }

  const response = await fetch('/api' + path, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    // expired or bad token: clear it and go back to login
    if (response.status === 401 && token) {
      logout()
      window.location.href = '/login'
    }
    throw new Error(body.error || 'Something went wrong')
  }
  return body
}
