
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getProfile } from '../services/authServices'

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifyUser() {
      try {
        const profile = await getProfile()
        setUser(profile)
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    verifyUser()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Verifying your login...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children(user)
}

export default ProtectedRoute
