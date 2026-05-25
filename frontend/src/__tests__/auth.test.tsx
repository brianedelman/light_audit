import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '../context/AuthContext'
import LoginPage from '../pages/LoginPage'

// Mock api module
vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock TanStack Router navigate
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ token: 'test-token' }),
  }
})

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null user when not authenticated', async () => {
    mockApi.get.mockRejectedValueOnce({ response: { status: 401 } })

    function TestComponent() {
      const { user, isLoading } = useAuth()
      if (isLoading) return <div>loading</div>
      return <div>{user ? user.email : 'no-user'}</div>
    }

    const Wrapper = makeWrapper()
    render(<TestComponent />, { wrapper: Wrapper })
    expect(await screen.findByText('no-user')).toBeInTheDocument()
  })

  it('returns user when authenticated', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { email: 'test@example.com', name: 'Test', url: '/api/users/1/' } })

    function TestComponent() {
      const { user, isLoading } = useAuth()
      if (isLoading) return <div>loading</div>
      return <div>{user ? user.email : 'no-user'}</div>
    }

    const Wrapper = makeWrapper()
    render(<TestComponent />, { wrapper: Wrapper })
    expect(await screen.findByText('test@example.com')).toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Auth check returns no user
    mockApi.get.mockRejectedValue({ response: { status: 401 } })
  })

  it('renders email and password fields', async () => {
    const Wrapper = makeWrapper()
    render(<LoginPage />, { wrapper: Wrapper })
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('calls login API on form submit', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { email: 'user@example.com', name: 'User', url: '/api/users/1/' },
    })

    const Wrapper = makeWrapper()
    render(<LoginPage />, { wrapper: Wrapper })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/auth/login/', {
        email: 'user@example.com',
        password: 'secret',
      })
    })
  })

  it('shows error on failed login', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { status: 401 } })

    const Wrapper = makeWrapper()
    render(<LoginPage />, { wrapper: Wrapper })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })
})
