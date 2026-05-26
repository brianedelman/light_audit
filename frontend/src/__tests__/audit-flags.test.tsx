import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useParams: vi.fn(() => ({ versionId: '1', roomId: '2' })),
  }
})

// Mock FloorTreeSidebar
vi.mock('../components/FloorTreeSidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

// Mock PanoramaViewer
vi.mock('../components/PanoramaViewer', () => ({
  default: () => <div data-testid="panorama-viewer" />,
}))

// Mock pannellum
vi.mock('pannellum/build/pannellum.js', () => ({}))

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

async function renderPage() {
  const { default: AuditVersionRoomPage } = await import('../pages/AuditVersionRoomPage')
  const client = makeClient()
  return render(
    <QueryClientProvider client={client}>
      <AuditVersionRoomPage />
    </QueryClientProvider>,
  )
}

const ROOM = {
  id: 2, name: 'Room A', room_type: 'office', zone_label: '', pin_code: '',
  square_feet: null, notes: '', created: '', modified: '',
}

const ENTRY = {
  id: 10, fixture_id: 'F001', qty: 4, wattage: '40', switch_type: 'toggle',
  controls: 'none', mount_type: 'surface', notes: '',
  flag_integral_sensor: false, flag_embb: false, flag_air_return: false,
  flag_wire_guard: false, flag_volt_480: false, flag_em_gen: false,
  flag_photocell: false, flag_twistlock_pc: false, flag_wet_location: false,
  flag_dark_sky: false,
}

const FLAG_WARN = {
  id: 1, log_entry_id: 10, severity: 'warn', message: 'Check voltage.',
  status: 'active', dismissed_reason: '', dismissed_at: null,
}

const FLAG_CRITICAL = {
  id: 2, log_entry_id: 10, severity: 'critical', message: 'Urgent issue.',
  status: 'active', dismissed_reason: '', dismissed_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()

  mockGet.mockImplementation((url: string) => {
    if (url.includes('/rooms/2/') && !url.includes('log-entries') && !url.includes('photos') && !url.includes('audit-flags')) {
      return Promise.resolve({ data: ROOM })
    }
    if (url.includes('log-entries')) return Promise.resolve({ data: [ENTRY] })
    if (url.includes('photos')) return Promise.resolve({ data: [] })
    if (url.includes('audit-flags')) return Promise.resolve({ data: [FLAG_WARN, FLAG_CRITICAL] })
    return Promise.resolve({ data: [] })
  })
})

describe('AuditFlag badges', () => {
  it('renders severity-colored badges for audit flags', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audit-flag-badge-1')).toBeInTheDocument()
      expect(screen.getByTestId('audit-flag-badge-2')).toBeInTheDocument()
    })
    expect(screen.getByTestId('audit-flag-badge-1')).toHaveTextContent('warn')
    expect(screen.getByTestId('audit-flag-badge-2')).toHaveTextContent('critical')
  })

  it('opens flag detail panel when badge clicked', async () => {
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    expect(screen.getByTestId('flag-detail-panel')).toBeInTheDocument()
    expect(screen.getByText('Check voltage.')).toBeInTheDocument()
  })

  it('closes flag detail panel when backdrop clicked', async () => {
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    expect(screen.getByTestId('flag-detail-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('flag-panel-backdrop'))
    expect(screen.queryByTestId('flag-detail-panel')).not.toBeInTheDocument()
  })

  it('closes flag detail panel when close button clicked', async () => {
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('flag-panel-close'))
    expect(screen.queryByTestId('flag-detail-panel')).not.toBeInTheDocument()
  })

  it('opens dismiss modal when dismiss button clicked', async () => {
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('dismiss-flag-btn'))
    expect(screen.getByTestId('dismiss-modal')).toBeInTheDocument()
    expect(screen.getByTestId('dismiss-reason-input')).toBeInTheDocument()
  })

  it('calls dismiss API and closes modal on confirm', async () => {
    mockPost.mockResolvedValue({ data: { ...FLAG_WARN, status: 'dismissed' } })
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('dismiss-flag-btn'))
    fireEvent.change(screen.getByTestId('dismiss-reason-input'), {
      target: { value: 'Already fixed.' },
    })
    fireEvent.click(screen.getByTestId('dismiss-confirm-btn'))
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/audit-flags/1/dismiss/', { reason: 'Already fixed.' })
    })
    await waitFor(() => {
      expect(screen.queryByTestId('dismiss-modal')).not.toBeInTheDocument()
    })
  })

  it('cancel button closes dismiss modal without calling API', async () => {
    await renderPage()
    await waitFor(() => screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('audit-flag-badge-1'))
    fireEvent.click(screen.getByTestId('dismiss-flag-btn'))
    fireEvent.click(screen.getByTestId('dismiss-cancel-btn'))
    expect(screen.queryByTestId('dismiss-modal')).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
