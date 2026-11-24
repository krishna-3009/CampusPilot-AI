import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  analyzeResume,
  getDocuments,
  streamDocumentQuestion,
  uploadDocument,
} from '../services/documentServices'
import {
  createInterviewQuestions,
  createInterviewReport,
  evaluateInterviewAnswer,
} from '../services/interviewServices'
import { logoutUser } from '../services/authServices'

const answerMarkdownComponents = {
  p: ({ children }) => (
    <p className="mb-3 leading-6 last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-lg font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-blue-400 pl-3 text-slate-300">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={`${className || 'rounded bg-slate-950 px-1 py-0.5'} font-mono text-xs`}
    >
      {children}
    </code>
  ),
}

function Dashboard({ user }) {
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const messagesEnd = useRef(null)
  const nextMessageId = useRef(0)
  const [documents, setDocuments] = useState([])
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [chatStatus, setChatStatus] = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [jobDescription, setJobDescription] = useState('')
  const [resumeAnalysis, setResumeAnalysis] = useState(null)
  const [analyzingResume, setAnalyzingResume] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [interviewJobDescription, setInterviewJobDescription] = useState('')
  const [interviewType, setInterviewType] = useState('mixed')
  const [interviewQuestions, setInterviewQuestions] = useState([])
  const [interviewIndex, setInterviewIndex] = useState(0)
  const [interviewAnswer, setInterviewAnswer] = useState('')
  const [interviewEvaluation, setInterviewEvaluation] = useState(null)
  const [interviewAnswers, setInterviewAnswers] = useState([])
  const [interviewReport, setInterviewReport] = useState(null)
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewError, setInterviewError] = useState('')

  useEffect(() => {
    let active = true

    getDocuments()
      .then(({ documents: loadedDocuments }) => {
        if (!active) return
        setDocuments(loadedDocuments)
        setSelectedDocumentId(loadedDocuments[0]?.document_id || '')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoadingDocuments(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function handleLogout() {
    try {
      await logoutUser()
      navigate('/login')
    } catch (logoutError) {
      setError(logoutError.message)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!selectedFile) {
      setError('Choose a PDF file to upload.')
      return
    }

    setUploading(true)

    try {
      const uploaded = await uploadDocument(selectedFile)
      const newDocument = {
        document_id: uploaded.document_id,
        filename: uploaded.filename,
        status: uploaded.status,
      }

      setDocuments((currentDocuments) => [
        newDocument,
        ...currentDocuments,
      ])
      setSelectedDocumentId(newDocument.document_id)
      setMessages([])
      setSelectedFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setNotice(`${newDocument.filename} is ready to chat with.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploading(false)
    }
  }

  function handleSelectDocument(documentId) {
    setSelectedDocumentId(documentId)
    setMessages([])
    setError('')
    setNotice('')
  }

  async function handleAsk(event) {
    event.preventDefault()
    const prompt = question.trim()

    if (!prompt || !selectedDocumentId || answering) return

    setError('')
    setNotice('')
    setChatStatus('Searching the document...')
    setQuestion('')
    const assistantMessageId = ++nextMessageId.current
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: 'user', content: prompt },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        sources: [],
      },
    ])
    setAnswering(true)

    try {
      await streamDocumentQuestion(
        selectedDocumentId,
        prompt,
        (streamEvent) => {
          if (streamEvent.type === 'status') {
            setChatStatus(streamEvent.message)
          } else if (streamEvent.type === 'reset') {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: '', sources: [] }
                  : message,
              ),
            )
          } else if (streamEvent.type === 'text') {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: message.content + streamEvent.text,
                    }
                  : message,
              ),
            )
          } else if (streamEvent.type === 'complete') {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, sources: streamEvent.sources }
                  : message,
              ),
            )
          }
        },
      )
    } catch (requestError) {
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.id !== assistantMessageId || message.content,
        ),
      )
      setError(requestError.message)
    } finally {
      setChatStatus('')
      setAnswering(false)
    }
  }

  async function handleResumeAnalysis(event) {
    event.preventDefault()
    setResumeError('')
    setResumeAnalysis(null)

    if (!resumeFile) {
      setResumeError('Choose your resume PDF first.')
      return
    }
    if (resumeFile.size > 10 * 1024 * 1024) {
      setResumeError('Your resume PDF must be 10 MB or smaller.')
      return
    }
    if (!jobDescription.trim()) {
      setResumeError('Paste the job description you want to target.')
      return
    }

    setAnalyzingResume(true)
    try {
      const result = await analyzeResume(resumeFile, jobDescription.trim())
      setResumeAnalysis(result.analysis)
    } catch (requestError) {
      setResumeError(requestError.message)
    } finally {
      setAnalyzingResume(false)
    }
  }

  async function handleStartInterview(event) {
    event.preventDefault()
    setInterviewError('')
    setInterviewReport(null)
    if (!interviewJobDescription.trim()) {
      setInterviewError('Add a job description to create role-specific questions.')
      return
    }

    setInterviewLoading(true)
    try {
      const result = await createInterviewQuestions(
        interviewJobDescription.trim(),
        interviewType,
      )
      setInterviewQuestions(result.questions)
      setInterviewIndex(0)
      setInterviewAnswer('')
      setInterviewEvaluation(null)
      setInterviewAnswers([])
    } catch (requestError) {
      setInterviewError(requestError.message)
    } finally {
      setInterviewLoading(false)
    }
  }

  async function handleSubmitInterviewAnswer(event) {
    event.preventDefault()
    const answer = interviewAnswer.trim()
    const question = interviewQuestions[interviewIndex]
    if (!answer || !question || interviewLoading) return

    setInterviewLoading(true)
    setInterviewError('')
    try {
      const result = await evaluateInterviewAnswer({
        job_description: interviewJobDescription.trim(),
        question: question.question,
        answer,
      })
      const completedAnswer = {
        question: question.question,
        answer,
        evaluation: result.evaluation,
      }
      setInterviewAnswers((current) => [...current, completedAnswer])
      setInterviewEvaluation(result.evaluation)
    } catch (requestError) {
      setInterviewError(requestError.message)
    } finally {
      setInterviewLoading(false)
    }
  }

  async function handleContinueInterview() {
    setInterviewError('')
    if (interviewIndex < interviewQuestions.length - 1) {
      setInterviewIndex((current) => current + 1)
      setInterviewAnswer('')
      setInterviewEvaluation(null)
      return
    }

    setInterviewLoading(true)
    try {
      const result = await createInterviewReport(
        interviewJobDescription.trim(),
        interviewAnswers,
      )
      setInterviewReport(result.report)
    } catch (requestError) {
      setInterviewError(requestError.message)
    } finally {
      setInterviewLoading(false)
    }
  }

  function handleResetInterview() {
    setInterviewQuestions([])
    setInterviewAnswers([])
    setInterviewIndex(0)
    setInterviewAnswer('')
    setInterviewEvaluation(null)
    setInterviewReport(null)
    setInterviewError('')
  }

  const selectedDocument = documents.find(
    (document) => document.document_id === selectedDocumentId,
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="dashboard-nav flex items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="CampusPilot workspace home">
          <span className="brand-mark">CP</span>
          <span className="brand-wordmark">CampusPilot <span className="text-blue-400">AI</span></span>
        </a>
        <div className="hidden items-center gap-1 lg:flex">
          <a href="#document-chat" className="dashboard-nav-link">Study</a>
          <a href="#resume-analyzer" className="dashboard-nav-link">Resume</a>
          <a href="#mock-interview" className="dashboard-nav-link">Interview</a>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="dashboard-user-mark" aria-hidden="true">
            {(user.name || 'S').trim().charAt(0).toUpperCase()}
          </span>
          <span className="hidden text-sm font-medium text-slate-300 sm:inline">
            {user.name || 'Student'}
          </span>
          <button
            onClick={handleLogout}
            className="dashboard-logout rounded-lg px-4 py-2"
          >
            Log out
          </button>
        </div>
      </nav>

      <main id="top" className="mx-auto max-w-7xl p-4 sm:p-8">
        <header className="dashboard-welcome mb-8 flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-slate-800 p-6 sm:p-8">
          <div>
            <p className="eyebrow">Your CampusPilot workspace</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Welcome, {user.name || 'Student'}.
            </h2>
            <p className="mt-3 max-w-xl text-slate-400">
              A little more clarity for class, career decisions, and what comes next.
            </p>
          </div>
          <div className="dashboard-welcome-note">
            <span className="dashboard-welcome-spark" aria-hidden="true">✦</span>
            <span><b>Keep your momentum</b><small>Pick one useful next step today.</small></span>
          </div>
        </header>

        <section id="document-chat" className="mt-8 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-6">
            <h3 className="text-2xl font-semibold">Document Chat</h3>
            <p className="mt-2 text-slate-400">
              Upload a study PDF and ask questions grounded in its contents.
            </p>
          </div>

          <div className="grid min-h-[560px] md:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-slate-800 p-5 md:border-b-0 md:border-r">
              <form onSubmit={handleUpload}>
                <label
                  htmlFor="document-file"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Add a PDF
                </label>
                <input
                  ref={fileInput}
                  id="document-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={uploading || answering}
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] || null)
                  }
                  className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-700"
                />
                <button
                  type="submit"
                  disabled={uploading || answering}
                  className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload PDF'}
                </button>
              </form>

              <h4 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Your documents
              </h4>

              {loadingDocuments ? (
                <p className="text-sm text-slate-500">Loading documents...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  Your uploaded PDFs will appear here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((document) => (
                    <li key={document.document_id}>
                      <button
                        type="button"
                        disabled={answering}
                        onClick={() =>
                          handleSelectDocument(document.document_id)
                        }
                        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                          selectedDocumentId === document.document_id
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-slate-800 text-slate-300 hover:bg-slate-800'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="block break-words font-medium">
                          {document.filename}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          PDF
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <div className="flex min-h-[560px] min-w-0 flex-col">
              <div className="border-b border-slate-800 px-5 py-4">
                <h4 className="truncate font-medium">
                  {selectedDocument?.filename || 'Choose a document'}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Answers include the pages used as sources.
                </p>
              </div>

              <div
                className="flex-1 space-y-4 overflow-y-auto p-5"
                aria-live="polite"
              >
                {!selectedDocument && (
                  <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm leading-6 text-slate-400">
                    Upload a PDF or select one from your documents to start
                    chatting.
                  </p>
                )}

                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'ml-auto bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="text-sm">
                        <ReactMarkdown components={answerMarkdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    )}
                    {message.sources?.length > 0 && (
                      <p className="mt-3 border-t border-slate-700 pt-2 text-xs text-blue-300">
                        Sources:{' '}
                        {message.sources
                          .map((source) => `Page ${source.page_number}`)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                ))}

                {answering && (
                  <p className="text-sm text-slate-400" role="status">
                    {chatStatus || 'Receiving the answer...'}
                  </p>
                )}
                <div ref={messagesEnd} />
              </div>

              {(error || notice) && (
                <p
                  role={error ? 'alert' : 'status'}
                  className={`mx-5 mb-3 rounded-lg px-3 py-2 text-sm ${
                    error
                      ? 'bg-red-950 text-red-300'
                      : 'bg-emerald-950 text-emerald-300'
                  }`}
                >
                  {error || notice}
                </p>
              )}

              <form
                onSubmit={handleAsk}
                className="flex gap-3 border-t border-slate-800 p-4"
              >
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form.requestSubmit()
                    }
                  }}
                  maxLength={1000}
                  rows={2}
                  disabled={!selectedDocument || answering}
                  placeholder={
                    selectedDocument
                      ? 'Ask something about this PDF...'
                      : 'Select a document to ask a question'
                  }
                  aria-label="Question about the selected document"
                  className="min-w-0 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!selectedDocument || answering || !question.trim()}
                  className="self-end rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {answering ? 'Thinking...' : 'Ask'}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section id="resume-analyzer" className="mt-8 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-6">
            <h3 className="text-2xl font-semibold">Resume Analyzer</h3>
            <p className="mt-2 max-w-3xl text-slate-400">
              Compare your resume with a target role. You’ll get a job-related
              match estimate, relevant strengths, skill gaps, and practical
              edits to consider.
            </p>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <form onSubmit={handleResumeAnalysis} className="space-y-5">
              <div>
                <label htmlFor="resume-file" className="mb-2 block text-sm font-medium text-slate-300">
                  Resume PDF
                </label>
                <input
                  id="resume-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={analyzingResume}
                  onChange={(event) => {
                    setResumeFile(event.target.files?.[0] || null)
                    setResumeAnalysis(null)
                    setResumeError('')
                  }}
                  className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-700"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Text-based PDFs up to 10 MB. The file is analyzed in memory
                  and is not added to your document library.
                </p>
              </div>

              <div>
                <label htmlFor="job-description" className="mb-2 block text-sm font-medium text-slate-300">
                  Job description
                </label>
                <textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  maxLength={12000}
                  rows={10}
                  disabled={analyzingResume}
                  placeholder="Paste the role responsibilities and requirements..."
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm leading-6 outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <p className="mt-1 text-right text-xs text-slate-500">
                  {jobDescription.length}/12000
                </p>
              </div>

              <button
                type="submit"
                disabled={analyzingResume}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                {analyzingResume ? 'Analyzing resume...' : 'Analyze against this role'}
              </button>

              {resumeError && (
                <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
                  {resumeError}
                </p>
              )}
            </form>

            <div className="min-h-72 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              {!resumeAnalysis && (
                <div className="flex h-full min-h-60 flex-col items-center justify-center text-center">
                  <span className="text-4xl" aria-hidden="true">✦</span>
                  <p className="mt-4 font-medium text-slate-300">
                    Your role-specific feedback will appear here
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    The match score is an AI estimate based on the text in your
                    resume and the job requirements, not a hiring decision.
                  </p>
                </div>
              )}

              {resumeAnalysis && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-4 border-b border-slate-800 pb-5">
                    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-blue-500 bg-blue-500/10">
                      <span className="text-2xl font-bold">{resumeAnalysis.match_score}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">match</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-lg font-semibold">Role alignment</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {resumeAnalysis.summary}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    {[
                      ['Skills evidenced in resume', resumeAnalysis.matched_skills, 'text-emerald-300'],
                      ['Requirements to address', resumeAnalysis.missing_skills, 'text-amber-300'],
                      ['Resume strengths', resumeAnalysis.strengths, 'text-blue-300'],
                      ['Areas to improve', resumeAnalysis.improvements, 'text-violet-300'],
                    ].map(([title, items, color]) => (
                      <div key={title}>
                        <h5 className={`text-sm font-semibold ${color}`}>{title}</h5>
                        {items.length ? (
                          <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-300">
                            {items.map((item, index) => (
                              <li key={`${title}-${index}`} className="flex gap-2">
                                <span className="text-slate-500" aria-hidden="true">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">No specific items identified.</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <h5 className="font-semibold text-white">Suggested next edits</h5>
                    {resumeAnalysis.suggestions.length ? (
                      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
                        {resumeAnalysis.suggestions.map((suggestion, index) => (
                          <li key={`suggestion-${index}`}>{suggestion}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">No additional edits suggested.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="mock-interview" className="mt-8 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-6">
            <h3 className="text-2xl font-semibold">AI Mock Interview</h3>
            <p className="mt-2 max-w-3xl text-slate-400">
              Practice five role-specific questions. Get feedback on every
              answer, then review a summary and a short practice plan.
            </p>
          </div>

          {!interviewQuestions.length ? (
            <form onSubmit={handleStartInterview} className="grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label htmlFor="interview-job" className="mb-2 block text-sm font-medium text-slate-300">
                  Target job description
                </label>
                <textarea
                  id="interview-job"
                  value={interviewJobDescription}
                  onChange={(event) => setInterviewJobDescription(event.target.value)}
                  maxLength={12000}
                  rows={7}
                  disabled={interviewLoading}
                  placeholder="Paste the role responsibilities and requirements..."
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm leading-6 outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="interview-type" className="mb-2 block text-sm font-medium text-slate-300">
                    Practice style
                  </label>
                  <select
                    id="interview-type"
                    value={interviewType}
                    onChange={(event) => setInterviewType(event.target.value)}
                    disabled={interviewLoading}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={interviewLoading}
                  className="rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {interviewLoading ? 'Preparing...' : 'Start interview'}
                </button>
              </div>
              {interviewError && (
                <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300 md:col-span-2">
                  {interviewError}
                </p>
              )}
            </form>
          ) : (
            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div>
                {interviewReport ? (
                  <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-5">
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                      Final practice report
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-blue-500 text-xl font-bold">
                        {interviewReport.overall_score}
                      </div>
                      <p className="text-sm leading-6 text-slate-200">{interviewReport.summary}</p>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      {[
                        ['Strong areas', interviewReport.strong_areas],
                        ['Focus areas', interviewReport.focus_areas],
                      ].map(([title, items]) => (
                        <div key={title}>
                          <h4 className="text-sm font-semibold text-white">{title}</h4>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-300">
                            {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <h4 className="mt-5 text-sm font-semibold text-white">Practice plan</h4>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-5 text-slate-300">
                      {interviewReport.practice_plan.map((item, index) => <li key={`plan-${index}`}>{item}</li>)}
                    </ol>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-blue-300">
                        Question {interviewIndex + 1} of {interviewQuestions.length}
                      </p>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs capitalize text-slate-300">
                        {interviewQuestions[interviewIndex].category}
                      </span>
                    </div>
                    <h4 className="mt-4 text-xl font-semibold leading-8">
                      {interviewQuestions[interviewIndex].question}
                    </h4>
                    <p className="mt-2 text-sm text-slate-400">
                      Focus: {interviewQuestions[interviewIndex].competency}
                    </p>
                    {!interviewEvaluation ? (
                      <form onSubmit={handleSubmitInterviewAnswer} className="mt-5">
                        <label htmlFor="interview-answer" className="mb-2 block text-sm font-medium text-slate-300">
                          Your answer
                        </label>
                        <textarea
                          id="interview-answer"
                          value={interviewAnswer}
                          onChange={(event) => setInterviewAnswer(event.target.value)}
                          maxLength={5000}
                          rows={8}
                          disabled={interviewLoading}
                          placeholder="Answer as if you were speaking to an interviewer. Include a specific example when you can."
                          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm leading-6 outline-none focus:border-blue-500 disabled:opacity-50"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-slate-500">{interviewAnswer.length}/5000</span>
                          <button
                            type="submit"
                            disabled={interviewLoading || !interviewAnswer.trim()}
                            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {interviewLoading ? 'Reviewing answer...' : 'Submit answer'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-5">
                        <p className="text-sm font-semibold text-emerald-300">
                          Answer score: {interviewEvaluation.score}/100
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {interviewEvaluation.feedback}
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          {[
                            ['What worked', interviewEvaluation.strengths],
                            ['Try improving', interviewEvaluation.improvements],
                          ].map(([title, items]) => (
                            <div key={title}>
                              <h5 className="text-sm font-semibold text-white">{title}</h5>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-300">
                                {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
                              </ul>
                            </div>
                          ))}
                        </div>
                        {interviewEvaluation.example_answer && (
                          <div className="mt-4 rounded-lg bg-slate-900 p-4">
                            <h5 className="text-sm font-semibold text-white">Example structure</h5>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                              {interviewEvaluation.example_answer}
                            </p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleContinueInterview}
                          disabled={interviewLoading}
                          className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold hover:bg-blue-700 disabled:opacity-60"
                        >
                          {interviewLoading
                            ? 'Creating report...'
                            : interviewIndex === interviewQuestions.length - 1
                              ? 'Finish and create report'
                              : 'Next question'}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {interviewError && (
                  <p role="alert" className="mt-4 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
                    {interviewError}
                  </p>
                )}
              </div>

              <aside className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
                <h4 className="font-semibold">Session progress</h4>
                <ol className="mt-4 space-y-3">
                  {interviewQuestions.map((question, index) => (
                    <li key={`question-${index}`} className="flex items-start gap-3 text-sm">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        index < interviewAnswers.length
                          ? 'bg-emerald-900 text-emerald-300'
                          : index === interviewIndex
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                      }`}>
                        {index < interviewAnswers.length ? '✓' : index + 1}
                      </span>
                      <span className={index === interviewIndex ? 'text-white' : 'text-slate-400'}>
                        {question.competency}
                      </span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={handleResetInterview}
                  className="mt-6 text-sm text-slate-400 underline underline-offset-4 hover:text-white"
                >
                  Start a new practice session
                </button>
                <p className="mt-5 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
                  Scores are practice guidance based on your written answers,
                  not a hiring decision. Session answers are not saved after you
                  leave this page.
                </p>
              </aside>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Dashboard
