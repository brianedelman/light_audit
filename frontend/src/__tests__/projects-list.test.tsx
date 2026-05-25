import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import ProjectsListPage from '../pages/ProjectsListPage'

const mockNavigate = vi.fn()

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

const PROJECTS = [
  { id: 1, name: 'Office Remodel', client: 'Acme Corp', project_type: 'normal', status: 'in_progress', building_count: 3, created: '2026-01-01T00:00:00Z', modified: '2026-01-02T00:00:00Z' },
  { id: 2, name: 'Warehouse Audit', client: 'Globex', project_type: 'nycecc', status: 'pending', building_count: 0, created: '2026-02-01T00:00:00Z', modified: '2026-02-02T00:00:00Z' },
]

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

describe('ProjectsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Auth check — return user for auth context
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/') return Promise.resolve({ data: PROJECTS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders project rows with name, client, status, building count', async () => {
    render(<ProjectsListPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText('Office Remodel')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('in progress')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    expect(screen.getByText('Warehouse Audit')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('navigates to project detail on row click', async () => {
    render(<ProjectsListPage />, { wrapper: makeWrapper() })

    const row = await screen.findByTestId('project-row-1')
    fireEvent.click(row)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/projects/$projectId', params: { projectId: '1' } })
    })
  })

  it('shows empty state when no projects', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })

    render(<ProjectsListPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('No projects found.')).toBeInTheDocument()
  })

  it('shows error state on API failure', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/') return Promise.reject(new Error('Network error'))
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })

    render(<ProjectsListPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Failed to load projects.')).toBeInTheDocument()
  })
})
