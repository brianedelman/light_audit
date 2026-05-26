import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import AuditVersionRoomPage from '../pages/AuditVersionRoomPage'

// Mock pannellum so tests don't need WebGL
vi.mock('pannellum/build/pannellum.js', () => ({}))

// Inject the window.pannellum global that the component uses
Object.defineProperty(window, 'pannellum', {
  value: {
    viewer: vi.fn(() => ({ destroy: vi.fn(), isLoaded: vi.fn(() => true) })),
  },
  writable: true,
})

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

const FIXTURE_PHOTO = {
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
}

const PANORAMA_PHOTO = {
  id: 2,
  photo_type: 'panorama',
  public_url: 'https://example.com/pano.jpg',
  thumbnail_url: 'https://example.com/pano-thumb.jpg',
  space_name: 'Main Hall',
  notes: '',
  taken_at: null,
  mime_type: 'image/jpeg',
  width: 8000,
  height: 4000,
}

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

function setupMocks(photos = [FIXTURE_PHOTO, PANORAMA_PHOTO]) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
    if (url === '/audit-versions/5/rooms/20/') return Promise.resolve({ data: ROOM })
    if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
    if (url === '/audit-versions/5/rooms/20/log-entries/') return Promise.resolve({ data: [] })
    if (url === '/audit-versions/5/rooms/20/photos/') return Promise.resolve({ data: photos })
    return Promise.reject(new Error(`unmocked GET ${url}`))
  })
}

describe('PanoramaViewer dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('clicking panorama photo opens PanoramaViewer, not Lightbox', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-2'))

    expect(screen.getByTestId('panorama-viewer')).toBeInTheDocument()
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument()
  })

  it('clicking non-panorama photo opens Lightbox, not PanoramaViewer', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-1'))

    expect(screen.getByTestId('lightbox')).toBeInTheDocument()
    expect(screen.queryByTestId('panorama-viewer')).not.toBeInTheDocument()
  })

  it('panorama viewer closes on close button click', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-2'))
    expect(screen.getByTestId('panorama-viewer')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('panorama-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('panorama-viewer')).not.toBeInTheDocument()
    })
  })

  it('panorama viewer closes on Escape key', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByTestId('photo-grid')
    fireEvent.click(screen.getByTestId('photo-thumb-2'))
    expect(screen.getByTestId('panorama-viewer')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('panorama-viewer')).not.toBeInTheDocument()
    })
  })
})
