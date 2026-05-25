import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import api from '../lib/api'

export default function PasswordResetConfirmPage() {
  const { token } = useParams({ strict: false }) as { token?: string }
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/auth/password-reset/confirm/', { token, password })
      setSubmitted(true)
    } catch {
      setError('Invalid or expired reset link.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="p-8">
          <h1 className="text-2xl font-bold">Password updated</h1>
          <a href="/login">Sign in with your new password</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-8">
        <h1 className="text-2xl font-bold">Set new password</h1>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="block w-full border px-3 py-2"
          />
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-blue-600 py-2 text-white">
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
