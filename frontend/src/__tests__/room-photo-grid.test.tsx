import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import AuditVersionRoomPage from '../pages/AuditVersionRoomPage'

const mockParams = { versionId: '5', roomId: '20' }

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
    useParams: () => mockParams,
    useNavigate: () => vi.fn(),
  }
})

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

const ROOM = {
  id: 20,
  name: 'Lobby',
  room_type: 'reception',
  zone_label: 'A',
  pin_code: '101',
  square_feet: 500,
  notes: '',
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
    rooms: [ROOM],
  },
]

const PHOTOS = [
  {
    id: 1,
    photo_type: 'fixture',
    public_url: 'https://example.com/photo1.jpg',
    thumbnail_url: 'https://example.com/thumb1.jpg',
    space_name: 'Bay 1',
    notes: '',
    taken_at: null,
    mime_type: 'image/jpeg',
    width: 1920,
    height: 1080,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    photo_type: 'switch',
    public_url: 'https://example.com/photo2.jpg',
    thumbnail_url: 'https://example.com/thumb2.jpg',
    space_name: 'Bay 2',
    notes: '',
    taken_at: null,
    mime_type: 'image/jpeg',
    width: 1920,
    height: 1080,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
  },
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

function setupMocks(photos = PHOTOS) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
    if (url === '/audit-versions/5/rooms/20/') return Promise.resolve({ data: ROOM })
    if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
    if (url === '/audit-versions/5/rooms/20/log-entries/') return Promise.resolve({ data: [] })
    if (url === '/audit-versions/5/rooms/20/photos/') return Promise.resolve({ data: photos })
    return Promise.reject(new Error(`unmocked GET ${url}`))
  })
}

describe('AuditVersionRoomPage photo grid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders photo thumbnails in grid', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('photo-grid')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-1')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-2')).toBeInTheDocument()
  })

  it('shows no-photos message when empty', async () => {
    setupMocks([])
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('no-photos')).toBeInTheDocument()
  })

  it('opens lightbox on thumbnail click', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-1'))

    expect(screen.getByTestId('lightbox')).toBeInTheDocument()
    const img = screen.getByTestId('lightbox-image') as HTMLImageElement
    expect(img.src).toBe('https://example.com/photo1.jpg')
  })

  it('closes lightbox on close button click', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-1'))
    expect(screen.getByTestId('lightbox')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('lightbox-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument()
    })
  })

  it('closes lightbox on Escape key', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-1'))
    expect(screen.getByTestId('lightbox')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument()
    })
  })

  it('navigates between photos with next button', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-1'))

    const img = screen.getByTestId('lightbox-image') as HTMLImageElement
    expect(img.src).toBe('https://example.com/photo1.jpg')

    fireEvent.click(screen.getByTestId('lightbox-next'))
    await waitFor(() => {
      const img2 = screen.getByTestId('lightbox-image') as HTMLImageElement
      expect(img2.src).toBe('https://example.com/photo2.jpg')
    })
  })
})
