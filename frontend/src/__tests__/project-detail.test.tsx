import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import ProjectDetailPage from '../pages/ProjectDetailPage'

const mockParams = { projectId: '1' }

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../lib/ws', () => ({
  connectWs: () => ({ send: vi.fn(), close: vi.fn() }),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => vi.fn(),
  }
})

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

const PROJECT = {
  id: 1,
  name: 'Office Remodel',
  client: 'Acme Corp',
  project_type: 'normal',
  status: 'in_progress',
  building_count: 2,
  created: '2026-01-01T00:00:00Z',
  modified: '2026-01-02T00:00:00Z',
}

const BUILDINGS = [
  { id: 10, name: 'Main Office', address: '123 Main St', building_type: 'office', square_feet: 50000, created: '2026-01-01T00:00:00Z', modified: '2026-01-02T00:00:00Z' },
  { id: 20, name: 'Annex', address: '', building_type: 'warehouse', square_feet: null, created: '2026-02-01T00:00:00Z', modified: '2026-02-02T00:00:00Z' },
]

const VERSIONS = [
  { id: 100, version_number: 2, label: 'Final', status: 'published', created_by_name: 'Alice', is_current: true, created: '2026-03-01T00:00:00Z', modified: '2026-03-02T00:00:00Z' },
  { id: 101, version_number: 1, label: 'Draft v1', status: 'draft', created_by_name: 'Bob', is_current: false, created: '2026-02-15T00:00:00Z', modified: '2026-02-16T00:00:00Z' },
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

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/1/') return Promise.resolve({ data: PROJECT })
      if (url === '/projects/1/buildings/') return Promise.resolve({ data: BUILDINGS })
      if (url.match(/\/buildings\/\d+\/audit-versions\//)) return Promise.resolve({ data: VERSIONS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
    mockApi.post.mockResolvedValue({ data: {} })
  })

  it('renders project metadata and buildings list', async () => {
    render(<ProjectDetailPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText('Office Remodel')).toBeInTheDocument()
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument()
    expect(screen.getByText('Main Office')).toBeInTheDocument()
    expect(screen.getByText('Annex')).toBeInTheDocument()
  })

  it('expands building to show audit versions table', async () => {
    render(<ProjectDetailPage />, { wrapper: makeWrapper() })

    const buildingRow = await screen.findByTestId('building-row-10')
    fireEvent.click(buildingRow)

    expect(await screen.findByTestId('versions-table-10')).toBeInTheDocument()
    expect(await screen.findByText('Final')).toBeInTheDocument()
    expect(screen.getByText('Draft v1')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('sorts audit versions table by column', async () => {
    render(<ProjectDetailPage />, { wrapper: makeWrapper() })

    const buildingRow = await screen.findByTestId('building-row-10')
    fireEvent.click(buildingRow)

    await screen.findByTestId('versions-table-10')

    // Click version number header to sort ascending
    const versionHeader = screen.getByText('#')
    fireEvent.click(versionHeader)

    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      // header row + 2 data rows; first data row should be version 1 after asc sort
      const cells = rows[2].querySelectorAll('td')
      expect(cells[0].textContent).toBe('1')
    })
  })

  it('shows error state on project load failure', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/1/') return Promise.reject(new Error('Network error'))
      if (url === '/projects/1/buildings/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })

    render(<ProjectDetailPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Failed to load project.')).toBeInTheDocument()
  })

  it('shows empty buildings state', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/projects/1/') return Promise.resolve({ data: PROJECT })
      if (url === '/projects/1/buildings/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })

    render(<ProjectDetailPage />, { wrapper: makeWrapper() })
    expect(await screen.findByText('No buildings found.')).toBeInTheDocument()
  })

  it('push-to-iPad button calls correct API endpoint', async () => {
    render(<ProjectDetailPage />, { wrapper: makeWrapper() })

    const buildingRow = await screen.findByTestId('building-row-10')
    fireEvent.click(buildingRow)

    const pushBtn = await screen.findByTestId('push-ipad-100')
    fireEvent.click(pushBtn)

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/audit-versions/100/push-to-ipad/')
    })
  })

  it('duplicate button calls correct API endpoint', async () => {
    render(<ProjectDetailPage />, { wrapper: makeWrapper() })

    const buildingRow = await screen.findByTestId('building-row-10')
    fireEvent.click(buildingRow)

    const dupBtn = await screen.findByTestId('duplicate-100')
    fireEvent.click(dupBtn)

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/audit-versions/100/duplicate/')
    })
  })
})
