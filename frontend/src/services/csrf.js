const API_URL = import.meta.env.VITE_API_URL
let cachedCsrfToken = null

export function clearCsrfToken() {
  cachedCsrfToken = null
}

export async function csrfHeaders() {
  if (!cachedCsrfToken) {
    const response = await fetch(`${API_URL}/api/auth/csrf`, {
      credentials: 'include',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.csrf_token) {
      throw new Error(data.message || data.msg || 'Your session has expired. Please log in again.')
    }
    cachedCsrfToken = data.csrf_token
  }

  return { 'X-CSRF-TOKEN': cachedCsrfToken }
}
