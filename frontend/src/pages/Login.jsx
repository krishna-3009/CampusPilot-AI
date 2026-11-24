
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginUser, loginWithGoogle } from '../services/authServices'
import GoogleSignInButton from '../components/GoogleSignInButton'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
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
    setLoading(true)

    try {
      await loginUser(email, password)

      navigate('/dashboard')
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
            <span className="eyebrow">Your student workspace</span>
            <h2>Keep moving toward the future you want.</h2>
            <p>Pick up your study sessions, career prep, and interview practice right where you left off.</p>
            <div className="auth-benefits">
              <span className="auth-benefit"><i className="auth-check">✓</i> Answers grounded in your study PDFs</span>
              <span className="auth-benefit"><i className="auth-check">✓</i> Practical resume feedback</span>
              <span className="auth-benefit"><i className="auth-check">✓</i> Role-focused interview practice</span>
            </div>
          </div>
          <span className="text-xs text-slate-400">A little more clarity for what comes next.</span>
        </aside>

        <div className="auth-form-panel">
          <form onSubmit={handleSubmit} className="auth-form">
            <Link to="/" className="auth-mobile-brand">
              <span className="brand-mark">CP</span>
              <span className="brand-wordmark">CampusPilot <span className="text-blue-400">AI</span></span>
            </Link>
            <span className="eyebrow">Welcome back</span>
            <h1 className="mt-3">Good to see you.</h1>
            <p className="auth-form-description">Log in to continue your CampusPilot journey.</p>

            <GoogleSignInButton onCredential={handleGoogleCredential} />
            <div className="auth-divider"><span>or continue with email</span></div>

            <div className="form-field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="form-field">
              <label htmlFor="login-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Logging in...' : 'Log in to your account'}
            </button>

            <p className="auth-switch">
              New to CampusPilot?{' '}
              <Link to="/register">Create an account</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
