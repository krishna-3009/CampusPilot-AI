const API_URL = import.meta.env.VITE_API_URL

async function readResponse(response, fallbackMessage) {
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage)
  }

  return data
}

function authHeaders() {
  const token = sessionStorage.getItem('access_token')

  if (!token) {
    throw new Error('Your session has expired. Please log in again.')
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

export async function getDocuments() {
  const response = await fetch(`${API_URL}/api/documents/`, {
    headers: authHeaders(),
  })

  return readResponse(response, 'Could not load your documents')
}

export async function uploadDocument(file) {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${API_URL}/api/documents/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  })

  return readResponse(response, 'Document upload failed')
}

export async function analyzeResume(file, jobDescription) {
  const body = new FormData()
  body.append('resume', file)
  body.append('job_description', jobDescription)

  const response = await fetch(`${API_URL}/api/resume/analyze`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  })

  return readResponse(response, 'Could not analyze this resume')
}

export async function askDocumentQuestion(documentId, question) {
  const response = await fetch(
    `${API_URL}/api/documents/${encodeURIComponent(documentId)}/chat`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
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
      headers: {
        ...authHeaders(),
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
