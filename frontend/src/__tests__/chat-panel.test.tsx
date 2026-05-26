import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import ChatPanel from '../components/ChatPanel'

// --- WS mock -----------------------------------------------------------
type MockWsOptions = {
  onMessage: (data: unknown) => void
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
}

let capturedOptions: MockWsOptions | null = null
let mockWsSend: ReturnType<typeof vi.fn>
let mockWsClose: ReturnType<typeof vi.fn>

vi.mock('../lib/ws', () => ({
  connectWs: (_path: string, options: MockWsOptions) => {
    capturedOptions = options
    mockWsSend = vi.fn()
    mockWsClose = vi.fn()
    // simulate open
    setTimeout(() => options.onOpen?.(), 0)
    return { send: mockWsSend, close: mockWsClose }
  },
}))

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> }

const PROMPTS = [
  { id: 1, name: 'Summarize findings', prompt_text: 'Summarize the audit findings.', agent_type: 'audit_review' },
  { id: 2, name: 'Energy savings', prompt_text: 'Estimate energy savings.', agent_type: 'audit_review' },
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

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOptions = null
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me/') return Promise.resolve({ data: { email: 'u@e.com', name: 'U', url: '/api/users/1/' } })
      if (url === '/predefined-prompts/') return Promise.resolve({ data: PROMPTS })
      return Promise.reject(new Error(`unmocked GET ${url}`))
    })
  })

  it('renders chat panel with input and send button', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(screen.getByTestId('chat-send')).toBeInTheDocument()
  })

  it('renders predefined prompts in dropdown', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })

    const select = await screen.findByTestId('predefined-prompt-select')
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Summarize findings')).toBeInTheDocument()
    expect(screen.getByText('Energy savings')).toBeInTheDocument()
  })

  it('sends freeform message over WS and renders user bubble', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })

    // wait for WS open
    await waitFor(() => expect(capturedOptions).not.toBeNull())

    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: 'What are the top issues?' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    expect(mockWsSend).toHaveBeenCalledWith(
      JSON.stringify({ prompt: 'What are the top issues?', predefined_prompt_id: null }),
    )

    expect(await screen.findByText('What are the top issues?')).toBeInTheDocument()
  })

  it('streams tokens into assistant bubble and finalizes on done', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(capturedOptions).not.toBeNull())

    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    // stream tokens
    act(() => {
      capturedOptions!.onMessage({ type: 'token', text: 'Hello' })
      capturedOptions!.onMessage({ type: 'token', text: ' world' })
    })

    expect(await screen.findByText('Hello world')).toBeInTheDocument()
    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument()

    // done
    act(() => {
      capturedOptions!.onMessage({ type: 'done' })
    })

    await waitFor(() => expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument())
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('sends predefined prompt text when prompt selected', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(capturedOptions).not.toBeNull())

    const select = await screen.findByTestId('predefined-prompt-select')
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    expect(mockWsSend).toHaveBeenCalledWith(
      JSON.stringify({ prompt: 'Summarize the audit findings.', predefined_prompt_id: 1 }),
    )
  })

  it('shows error message from WS error event', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(capturedOptions).not.toBeNull())

    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: 'trigger error' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    act(() => {
      capturedOptions!.onMessage({ type: 'error', message: 'Something went wrong' })
    })

    expect(await screen.findByText('Error: Something went wrong')).toBeInTheDocument()
  })

  it('iterative follow-ups append to conversation', async () => {
    render(<ChatPanel versionId="5" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(capturedOptions).not.toBeNull())

    // First message
    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: 'First question' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    act(() => {
      capturedOptions!.onMessage({ type: 'token', text: 'First answer' })
      capturedOptions!.onMessage({ type: 'done' })
    })

    await waitFor(() => expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument())

    // Second message
    fireEvent.change(input, { target: { value: 'Follow up' } })
    fireEvent.click(screen.getByTestId('chat-send'))

    act(() => {
      capturedOptions!.onMessage({ type: 'token', text: 'Second answer' })
      capturedOptions!.onMessage({ type: 'done' })
    })

    await waitFor(() => expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument())

    // Both user messages and both assistant messages present
    expect(screen.getByText('First question')).toBeInTheDocument()
    expect(screen.getByText('First answer')).toBeInTheDocument()
    expect(screen.getByText('Follow up')).toBeInTheDocument()
    expect(screen.getByText('Second answer')).toBeInTheDocument()
  })
})
