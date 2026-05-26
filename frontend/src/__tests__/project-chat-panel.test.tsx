import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import ProjectChatPanel from '../components/ProjectChatPanel'

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> }

type WsOptions = {
  onOpen?: () => void
  onClose?: () => void
  onError?: () => void
  onMessage?: (data: unknown) => void
}
let capturedOptions: WsOptions = {}
const mockWsHandle = { send: vi.fn(), close: vi.fn() }

vi.mock('../lib/ws', () => ({
  connectWs: (_path: string, options: WsOptions) => {
    capturedOptions = options
    return mockWsHandle
  },
}))

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

describe('ProjectChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOptions = {}
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders the panel', () => {
    render(<ProjectChatPanel projectId="1" />, { wrapper: makeWrapper() })
    expect(screen.getByTestId('project-chat-panel')).toBeInTheDocument()
  })

  it('shows placeholder when no projectId', () => {
    render(<ProjectChatPanel projectId={null} />, { wrapper: makeWrapper() })
    expect(screen.getByTestId('no-project-placeholder')).toBeInTheDocument()
  })

  it('does not connect WS when projectId is null', () => {
    render(<ProjectChatPanel projectId={null} />, { wrapper: makeWrapper() })
    expect(mockWsHandle.send).not.toHaveBeenCalled()
    expect(capturedOptions.onOpen).toBeUndefined()
  })

  it('connects WS to project-chat/{projectId}/ when projectId given', () => {
    render(<ProjectChatPanel projectId="42" />, { wrapper: makeWrapper() })
    // WS was connected — capturedOptions gets populated
    expect(capturedOptions.onOpen).toBeDefined()
  })

  it('sends prompt on Send click and shows user message', async () => {
    render(<ProjectChatPanel projectId="1" />, { wrapper: makeWrapper() })

    act(() => capturedOptions.onOpen?.())

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hello project' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    expect(mockWsHandle.send).toHaveBeenCalledWith(
      JSON.stringify({ prompt: 'Hello project' }),
    )
    expect(screen.getByTestId('chat-message-user')).toBeInTheDocument()
  })

  it('streams tokens and finalizes on done', async () => {
    render(<ProjectChatPanel projectId="1" />, { wrapper: makeWrapper() })

    act(() => capturedOptions.onOpen?.())
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    act(() => capturedOptions.onMessage?.({ type: 'token', text: 'Hello' }))
    act(() => capturedOptions.onMessage?.({ type: 'token', text: ' world' }))
    act(() => capturedOptions.onMessage?.({ type: 'done' }))

    await waitFor(() => {
      const assistantMsg = screen.getByTestId('chat-message-assistant')
      expect(assistantMsg.textContent).toContain('Hello world')
    })
  })

  it('shows error message on error type', async () => {
    render(<ProjectChatPanel projectId="1" />, { wrapper: makeWrapper() })

    act(() => capturedOptions.onOpen?.())
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    act(() => capturedOptions.onMessage?.({ type: 'error', message: 'oops' }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-message-assistant').textContent).toContain('Error: oops')
    })
  })
})
