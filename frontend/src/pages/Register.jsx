
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginWithGoogle, registerUser } from '../services/authServices'
import GoogleSignInButton from '../components/GoogleSignInButton'

function Register() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGoogleCredential = useCallback(async (credential) => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle(credential)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    setLoading(true)

    try {
      const data = await registerUser(name, email, password)

      setSuccess(data.message)

      setTimeout(() => {
        navigate('/login')
      }, 1200)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-story">
          <Link to="/" className="flex w-fit items-center gap-3">
            <span className="brand-mark">CP</span>
            <span className="brand-wordmark">CampusPilot <span className="text-blue-400">AI</span></span>
          </Link>
          <div className="auth-story-copy">
            <span className="eyebrow">A smarter place to start</span>
            <h2>Your goals deserve a plan that moves with you.</h2>
            <p>Bring your learning and career preparation into one calm, focused space.</p>
            <div className="auth-benefits">
              <span className="auth-benefit"><i className="auth-check">✓</i> Chat with your own study documents</span>
              <span className="auth-benefit"><i className="auth-check">✓</i> Get feedback tailored to the role</span>
              <span className="auth-benefit"><i className="auth-check">✓</i> Practice before the real interview</span>
            </div>
          </div>
          <span className="text-xs text-slate-400">Start small. Keep making progress.</span>
        </aside>

        <div className="auth-form-panel">
          <form onSubmit={handleSubmit} className="auth-form">
            <Link to="/" className="auth-mobile-brand">
              <span className="brand-mark">CP</span>
              <span className="brand-wordmark">CampusPilot <span className="text-blue-400">AI</span></span>
            </Link>
            <span className="eyebrow">Create your account</span>
            <h1 className="mt-3">Start your next chapter.</h1>
            <p className="auth-form-description">Set up your space for learning and career growth.</p>

            <GoogleSignInButton onCredential={handleGoogleCredential} text="signup_with" />
            <div className="auth-divider"><span>or sign up with email</span></div>

            <div className="form-field">
              <label htmlFor="register-name">Full name</label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="register-email">Email address</label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="register-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && <p className="auth-message" role="alert">{error}</p>}
            {success && <p className="auth-message success" role="status">{success}</p>}

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Creating your account...' : 'Create account'}
            </button>

            <p className="auth-switch">
              Already have an account?{' '}
              <Link to="/login">Log in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Register
