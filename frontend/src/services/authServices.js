
const API_URL = import.meta.env.VITE_API_URL
import { clearCsrfToken } from './csrf'

async function readResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.msg || fallbackMessage)
  return data
}

export async function registerUser(name, email, password) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      email,
      password,
    }),
  })

  return readResponse(response, 'Registration failed')
}

export async function loginUser(email, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  const data = await readResponse(response, 'Login failed')
  clearCsrfToken()
  return data
}

export async function loginWithGoogle(credential) {
  const response = await fetch(`${API_URL}/api/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })

  const data = await readResponse(response, 'Google sign-in failed')
  clearCsrfToken()
  return data
}

export async function getProfile() {
  const response = await fetch(`${API_URL}/api/auth/profile`, {
    credentials: 'include',
  })
  return readResponse(response, 'Authentication failed')
}

export async function logoutUser() {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  const data = await readResponse(response, 'Could not log out')
  clearCsrfToken()
  return data
}

