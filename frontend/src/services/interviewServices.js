const API_URL = import.meta.env.VITE_API_URL || ''
import { csrfHeaders } from './csrf'

async function authHeaders() {
  return {
    ...await csrfHeaders(),
    'Content-Type': 'application/json',
  }
}

async function postInterview(path, payload, fallbackMessage) {
  const response = await fetch(`${API_URL}/api/interviews/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || fallbackMessage)
  }
  return data
}

export function createInterviewQuestions(jobDescription, interviewType) {
  return postInterview(
    'questions',
    { job_description: jobDescription, interview_type: interviewType },
    'Could not create interview questions',
  )
}

export function evaluateInterviewAnswer(payload) {
  return postInterview('evaluate', payload, 'Could not evaluate this answer')
}

export function createInterviewReport(jobDescription, answers) {
  return postInterview(
    'report',
    { job_description: jobDescription, answers },
    'Could not create your interview report',
  )
}
