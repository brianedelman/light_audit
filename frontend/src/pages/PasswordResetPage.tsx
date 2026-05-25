import { useState } from 'react'
import api from '../lib/api'

export default function PasswordResetPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/auth/password-reset/', { email })
      setSubmitted(true)
    } catch {
      setError('Unable to send reset email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="p-8">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p>If an account exists for {email}, you will receive a reset link.</p>
          <a href="/login">Back to sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-8">
        <h1 className="text-2xl font-bold">Reset password</h1>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="block w-full border px-3 py-2"
          />
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-blue-600 py-2 text-white">
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
        <a href="/login">Back to sign in</a>
      </form>
    </div>
  )
}
