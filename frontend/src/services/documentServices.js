const API_URL = import.meta.env.VITE_API_URL
import { csrfHeaders } from './csrf'

async function readResponse(response, fallbackMessage) {
  const data = await response.json()

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

  if (!response.body) {
    throw new Error('Your browser does not support streamed responses.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function dispatchLine(line) {
    if (!line.trim()) return

    const event = JSON.parse(line)
    if (event.type === 'error') {
      throw new Error(event.message || 'Could not get an answer')
    }

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
  } finally {
    reader.releaseLock()
  }
}
