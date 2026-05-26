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
  notes: 'Main entrance',
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

const LOG_ENTRIES = [
  {
    id: 1,
    fixture_id: 'E1',
    qty: 4,
    wattage: '32.50',
    switch_type: 'toggle',
    controls: 'none',
    mount_type: 'surface',
    notes: 'Replace soon',
    flag_integral_sensor: true,
    flag_embb: false,
    flag_air_return: false,
    flag_wire_guard: false,
    flag_volt_480: false,
    flag_em_gen: false,
    flag_photocell: false,
    flag_twistlock_pc: false,
    flag_wet_location: false,
    flag_dark_sky: false,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    fixture_id: 'E2',
    qty: 2,
    wattage: '18.00',
    switch_type: 'dimmer',
    controls: 'daylight',
    mount_type: 'wall',
    notes: '',
    flag_integral_sensor: false,
    flag_embb: true,
    flag_air_return: false,
    flag_wire_guard: false,
    flag_volt_480: false,
    flag_em_gen: false,
    flag_photocell: false,
    flag_twistlock_pc: false,
    flag_wet_location: false,
    flag_dark_sky: false,
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

describe('AuditVersionRoomPage log entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/rooms/20/') return Promise.resolve({ data: ROOM })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      if (url === '/audit-versions/5/rooms/20/log-entries/') return Promise.resolve({ data: LOG_ENTRIES })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders log entries table with fixture IDs', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByTestId('log-entries-table')).toBeInTheDocument()
    expect(await screen.findByText('E1')).toBeInTheDocument()
    expect(screen.getByText('E2')).toBeInTheDocument()
  })

  it('renders flag icons for active flags', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    // E1 has flag_integral_sensor → badge "IS"
    expect(await screen.findByText('IS')).toBeInTheDocument()
    // E2 has flag_embb → badge "EMBB"
    expect(screen.getByText('EMBB')).toBeInTheDocument()
  })

  it('renders correct qty and wattage values', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(screen.getByText('32.50')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('18.00')).toBeInTheDocument()
  })

  it('sorts by fixture_id column on header click', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByText('E1')

    const fixtureHeader = screen.getByText('Fixture ID')
    fireEvent.click(fixtureHeader) // asc

    await waitFor(() => {
      const cells = screen.getAllByText(/^E\d$/)
      expect(cells[0].textContent).toBe('E1')
    })

    fireEvent.click(fixtureHeader) // desc

    await waitFor(() => {
      const cells = screen.getAllByText(/^E\d$/)
      expect(cells[0].textContent).toBe('E2')
    })
  })

  it('filters rows via global filter input', async () => {
    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    await screen.findByText('E1')

    const filterInput = screen.getByTestId('log-entries-filter')
    fireEvent.change(filterInput, { target: { value: 'E2' } })

    await waitFor(() => {
      expect(screen.queryByText('E1')).not.toBeInTheDocument()
      expect(screen.getByText('E2')).toBeInTheDocument()
    })
  })

  it('shows empty state when no log entries', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/audit-versions/5/rooms/20/') return Promise.resolve({ data: ROOM })
      if (url === '/audit-versions/5/floors/') return Promise.resolve({ data: FLOORS })
      if (url === '/audit-versions/5/rooms/20/log-entries/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })

    render(<AuditVersionRoomPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText('No log entries found.')).toBeInTheDocument()
  })
})
