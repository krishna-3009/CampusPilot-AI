import { useEffect, useRef, useState } from 'react'

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'
const GOOGLE_CLIENT_ID_KEY = '__campusPilotGoogleClientId'

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)

  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = GOOGLE_SCRIPT
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', () => resolve(window.google), { once: true })
    script.addEventListener('error', () => reject(new Error('Google sign-in could not load.')), { once: true })
  })
}

function GoogleSignInButton({ onCredential, text = 'signin_with' }) {
  const buttonRef = useRef(null)
  const onCredentialRef = useRef(onCredential)
  const [loadError, setLoadError] = useState('')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const hasWebClientId = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId || '')

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    let active = true
    if (!hasWebClientId || !buttonRef.current) return undefined

    loadGoogleIdentity()
      .then((google) => {
        if (!active || !buttonRef.current) return
        if (window[GOOGLE_CLIENT_ID_KEY] !== clientId) {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
              if (response.credential) onCredentialRef.current(response.credential)
            },
          })
          window[GOOGLE_CLIENT_ID_KEY] = clientId
        }
        buttonRef.current.replaceChildren()
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: Math.min(360, buttonRef.current.clientWidth || 360),
          logo_alignment: 'left',
        })
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })

    return () => { active = false }
  }, [clientId, hasWebClientId, text])

  if (!clientId) {
    return <p className="google-signin-note">Add VITE_GOOGLE_CLIENT_ID to frontend/.env to enable Google sign-in.</p>
  }

  if (!hasWebClientId) {
    return <p className="google-signin-note" role="alert">Google sign-in needs a Web application OAuth client ID ending in .apps.googleusercontent.com. Update VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID with that same value.</p>
  }

  return (
    <div className="google-signin-wrap">
      <div ref={buttonRef} className="google-signin-button" />
      {loadError && <p className="auth-message" role="alert">{loadError}</p>}
    </div>
  )
}

export default GoogleSignInButton
