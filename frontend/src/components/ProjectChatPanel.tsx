import { useEffect, useRef, useState } from 'react'
import { connectWs } from '../lib/ws'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface WsMessage {
  type: 'token' | 'done' | 'error'
  text?: string
  message?: string
}

interface ProjectChatPanelProps {
  projectId: string | null
}

export default function ProjectChatPanel({ projectId }: ProjectChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!projectId) return

    const ws = connectWs(`project-chat/${projectId}/`, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onMessage: (data: unknown) => {
        const msg = data as WsMessage
        if (msg.type === 'token') {
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (msg.text ?? '') },
              ]
            }
            return [...prev, { role: 'assistant', content: msg.text ?? '', streaming: true }]
          })
        } else if (msg.type === 'done') {
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { role: 'assistant', content: last.content }]
            }
            return prev
          })
          setStreaming(false)
        } else if (msg.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${msg.message ?? 'Unknown error'}` },
          ])
          setStreaming(false)
        }
      },
    })
    wsRef.current = ws
    return () => {
      ws.close()
    }
  }, [projectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || !wsRef.current || streaming) return
    setMessages((prev) => [...prev, { role: 'user', content: input }])
    wsRef.current.send(JSON.stringify({ prompt: input }))
    setInput('')
    setStreaming(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white" data-testid="project-chat-panel">
      <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
        Project Chat
        {projectId && !connected && (
          <span className="ml-2 text-xs text-yellow-600" data-testid="chat-disconnected">
            connecting…
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
        {!projectId ? (
          <p className="text-sm text-gray-400" data-testid="no-project-placeholder">
            Select a project to start chatting.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400">Ask a question about this project…</p>
        ) : null}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            data-testid={`chat-message-${msg.role}`}
          >
            <div
              className={
                msg.role === 'user'
                  ? 'max-w-xs rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                  : 'max-w-sm rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800'
              }
            >
              {msg.content}
              {msg.streaming && (
                <span className="ml-1 animate-pulse text-gray-400" data-testid="streaming-indicator">
                  ▌
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-none rounded border border-gray-300 px-2 py-1 text-sm"
            rows={2}
            placeholder="Ask about this project…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming || !connected || !projectId}
            data-testid="chat-input"
          />
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSend}
            disabled={streaming || !connected || !projectId || !input.trim()}
            data-testid="chat-send"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
