const API_URL = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:5001') : ''
import { csrfHeaders } from './csrf'

async function readResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const responseText = await response.text()
  let data

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new Error('The server returned an invalid response. Please try again.')
    }
  } else {
    const normalizedBody = responseText.trimStart().toLowerCase()
    throw new Error(
      normalizedBody.startsWith('<!doctype html') || normalizedBody.startsWith('<html')
        ? 'The API route is returning the app page instead of data. The deployment needs the latest Vercel API rewrite.'
        : fallbackMessage,
    )
  }

  if (!response.ok) {
    throw new Error(data.message || data.msg || fallbackMessage)
  }

  return data
}

async function requestOptions(method = 'GET') {
  const options = { credentials: 'include' }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    options.headers = await csrfHeaders()
  }
  return options
}

export async function getDocuments() {
  const response = await fetch(`${API_URL}/api/documents/`, {
    ...await requestOptions(),
    cache: 'no-store',
  })

  return readResponse(response, 'Could not load your documents')
}

export async function uploadDocument(file) {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${API_URL}/api/documents/upload`, {
    ...await requestOptions('POST'),
    method: 'POST',
    body,
  })

  return readResponse(response, 'Document upload failed')
}

export async function analyzeResume(file, jobDescription) {
  const body = new FormData()
  body.append('resume', file)
  body.append('job_description', jobDescription)

  const response = await fetch(`${API_URL}/api/resume/analyze`, {
    ...await requestOptions('POST'),
    method: 'POST',
    body,
  })

  return readResponse(response, 'Could not analyze this resume')
}

export async function askDocumentQuestion(documentId, question) {
  const response = await fetch(
    `${API_URL}/api/documents/${encodeURIComponent(documentId)}/chat`,
    {
      method: 'POST',
      ...await requestOptions('POST'),
      headers: {
        ...await csrfHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    },
  )

  return readResponse(response, 'Could not get an answer')
}

export async function streamDocumentQuestion(documentId, question, onEvent) {
  const response = await fetch(
    `${API_URL}/api/documents/${encodeURIComponent(documentId)}/chat/stream`,
    {
      method: 'POST',
      ...await requestOptions('POST'),
      headers: {
        ...await csrfHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    },
  )

  if (!response.ok) {
    await readResponse(response, 'Could not get an answer')
  }

  if (!(response.headers.get('content-type') || '').includes('application/x-ndjson')) {
    await readResponse(response, 'The server returned an unexpected response.')
  }

  if (!response.body) {
    throw new Error('Your browser does not support streamed responses.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let receivedText = false
  let completed = false

  function dispatchLine(line) {
    if (!line.trim()) return

    const event = JSON.parse(line)
    if (event.type === 'error') {
      throw new Error(event.message || 'Could not get an answer')
    }

    if (event.type === 'text' && typeof event.text === 'string' && event.text.length > 0) {
      receivedText = true
    }
    if (event.type === 'complete') completed = true
    onEvent(event)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        dispatchLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }

      if (done) break
    }

    dispatchLine(buffer)
    if (!completed) {
      throw new Error('The answer stream ended unexpectedly. Please try again.')
    }
    if (!receivedText) {
      throw new Error('No answer was returned. Please try asking again.')
    }
  } finally {
    reader.releaseLock()
  }
}
