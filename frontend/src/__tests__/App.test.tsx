import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, createRootRoute } from '@tanstack/react-router'
import { RouterProvider } from '@tanstack/react-router'

// Minimal router sanity check: root route renders
const rootRoute = createRootRoute({ component: () => <div>Test Root</div> })
const testRouter = createRouter({ routeTree: rootRoute.addChildren([]) })

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('Router', () => {
  it('renders root route', async () => {
    render(<RouterProvider router={testRouter} />, { wrapper })
    expect(await screen.findByText('Test Root')).toBeInTheDocument()
  })
})

// Suppress unhandled vi mock warnings
vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn().mockRejectedValue({ response: { status: 401 } }),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}))
