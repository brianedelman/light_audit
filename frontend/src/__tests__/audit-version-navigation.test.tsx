import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import AuditVersionPage from '../pages/AuditVersionPage'
import AuditVersionFloorPage from '../pages/AuditVersionFloorPage'
import AuditVersionRoomPage from '../pages/AuditVersionRoomPage'
import FloorTreeSidebar from '../components/FloorTreeSidebar'

const mockNavigate = vi.fn()
const mockParams: Record<string, string> = { versionId: '5', floorId: '10', roomId: '20' }

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
    useNavigate: () => mockNavigate,
  }
})

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

const VERSION = {
  id: 5,
  version_number: 3,
  label: 'Sprint A',
  status: 'draft',
  is_current: false,
  created_by_name: 'Alice',
  created: '2026-01-01T00:00:00Z',
  modified: '2026-01-02T00:00:00Z',
}

const FLOORS = [
  {
    id: 10,
    name: 'Ground Floor',
    level: 0,
    sort_order: 0,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-02T00:00:00Z',
    rooms: [
      {
        id: 20,
        name: 'Lobby',
        room_type: 'reception',
        zone_label: 'A',
        pin_code: '101',
        square_feet: 500,
        notes: 'Main entrance',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-02T00:00:00Z',
      },
      {
        id: 21,
        name: 'Break Room',
        room_type: 'kitchen',
        zone_label: 'B',
        pin_code: '102',
        square_feet: 200,
        notes: '',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-02T00:00:00Z',
      },
    ],
  },
  {
    id: 11,
    name: 'Second Floor',
    level: 1,
    sort_order: 1,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-02T00:00:00Z',
    rooms: [],
  },
]

const ROOM = FLOORS[0].rooms[0]

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

describe('AuditVersionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/') return Promise.resolve({ data: VERSION })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      if (url === '/predefined-prompts/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders version info and floor tree sidebar', async () => {
    render(<AuditVersionPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('audit-version-page')).toBeInTheDocument()
    expect(await screen.findByText('Version 3')).toBeInTheDocument()
    expect(screen.getByText('Sprint A')).toBeInTheDocument()
    expect(await screen.findByTestId('floor-tree-sidebar')).toBeInTheDocument()
  })
})

describe('FloorTreeSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders floor names from mocked API', async () => {
    render(<FloorTreeSidebar versionId="5" />, { wrapper: makeWrapper() })

    expect(await screen.findByText('Ground Floor')).toBeInTheDocument()
    expect(screen.getByText('Second Floor')).toBeInTheDocument()
  })

  it('renders room names after expanding a floor', async () => {
    render(<FloorTreeSidebar versionId="5" />, { wrapper: makeWrapper() })

    const toggle = await screen.findByTestId('floor-toggle-10')
    fireEvent.click(toggle)

    expect(await screen.findByText('Lobby')).toBeInTheDocument()
    expect(screen.getByText('Break Room')).toBeInTheDocument()
  })

  it('clicking a floor navigates to floor URL', async () => {
    render(<FloorTreeSidebar versionId="5" />, { wrapper: makeWrapper() })

    const floorLink = await screen.findByTestId('floor-link-10')
    fireEvent.click(floorLink)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/audit-versions/$versionId/floors/$floorId',
        params: { versionId: '5', floorId: '10' },
      })
    })
  })

  it('clicking a room navigates to room URL', async () => {
    render(<FloorTreeSidebar versionId="5" />, { wrapper: makeWrapper() })

    const toggle = await screen.findByTestId('floor-toggle-10')
    fireEvent.click(toggle)

    const roomLink = await screen.findByTestId('room-link-20')
    fireEvent.click(roomLink)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/audit-versions/$versionId/rooms/$roomId',
        params: { versionId: '5', roomId: '20' },
      })
    })
  })
})

describe('AuditVersionFloorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders floor page with sidebar and floor content', async () => {
    render(<AuditVersionFloorPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('floor-page')).toBeInTheDocument()
    const groundFloorEls = await screen.findAllByText('Ground Floor')
    expect(groundFloorEls.length).toBeGreaterThan(0)
    expect(await screen.findByTestId('floor-tree-sidebar')).toBeInTheDocument()
    // Room list in main content
    const lobbies = await screen.findAllByText('Lobby')
    expect(lobbies.length).toBeGreaterThan(0)
  })
})

describe('AuditVersionRoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/rooms/20/') return Promise.resolve({ data: ROOM })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders room page with sidebar and room detail', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('room-page')).toBeInTheDocument()
    expect(await screen.findByText('Lobby')).toBeInTheDocument()
    expect(screen.getByText('reception')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('Main entrance')).toBeInTheDocument()
    expect(await screen.findByTestId('floor-tree-sidebar')).toBeInTheDocument()
  })
})
