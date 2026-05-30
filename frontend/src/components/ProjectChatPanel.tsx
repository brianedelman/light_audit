import { useEffect, useRef, useState } from "react";
import { connectWs } from "../lib/ws";
import { Starburst } from "./Brand";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface WsMessage {
  type: "token" | "done" | "error";
  text?: string;
  message?: string;
}

interface ProjectChatPanelProps {
  projectId: string | null;
}

export default function ProjectChatPanel({ projectId }: ProjectChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const ws = connectWs(`project-chat/${projectId}/`, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onMessage: (data: unknown) => {
        const msg = data as WsMessage;
        if (msg.type === "token") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (msg.text ?? "") },
              ];
            }
            return [
              ...prev,
              { role: "assistant", content: msg.text ?? "", streaming: true },
            ];
          });
        } else if (msg.type === "done") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { role: "assistant", content: last.content },
              ];
            }
            return prev;
          });
          setStreaming(false);
        } else if (msg.type === "error") {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${msg.message ?? "Unknown error"}`,
            },
          ]);
          setStreaming(false);
        }
      },
    });
    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || !wsRef.current || streaming) return;
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    wsRef.current.send(JSON.stringify({ prompt: input }));
    setInput("");
    setStreaming(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="relative flex h-full flex-col"
      data-testid="project-chat-panel"
    >
      <div className="flex items-center justify-between border-b border-[var(--brand-rule)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Starburst className="h-4 w-4 text-[var(--brand-ember)]" />
          <div>
            <div className="det-label !text-[0.6rem]">Assistant</div>
            <div className="font-display text-base font-medium tracking-tight text-[var(--brand-ink)]">
              Project chat
            </div>
          </div>
        </div>
        {projectId && (
          <span
            className={
              "det-chip " +
              (connected
                ? "border-[var(--brand-teal)]/60 text-[var(--brand-teal)]"
                : "border-[var(--brand-ember)]/60 text-[var(--brand-ember)]")
            }
            data-testid={!connected ? "chat-disconnected" : undefined}
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (connected
                  ? "bg-[var(--brand-teal)]"
                  : "bg-[var(--brand-ember)] animate-pulse")
              }
            />
            {connected ? "live" : "connecting"}
          </span>
        )}
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        data-testid="chat-messages"
      >
        {!projectId ? (
          <EmptyHint
            testId="no-project-placeholder"
            title="Pick a project"
            body="Select a project from the list to start chatting with the assistant."
          />
        ) : messages.length === 0 ? (
          <EmptyHint
            title="Ask anything"
            body="Try: “Summarize recent audits for this project.”"
          />
        ) : null}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user" ? "flex justify-end" : "flex justify-start"
            }
            data-testid={`chat-message-${msg.role}`}
          >
            <div
              className={
                "max-w-[85%] rounded-sm px-3 py-2 text-sm leading-relaxed " +
                (msg.role === "user"
                  ? "bg-[var(--brand-ink)] text-[var(--brand-paper)]"
                  : "border border-[var(--brand-rule)] bg-[var(--brand-paper-soft)] text-[var(--brand-ink)]")
              }
            >
              {msg.content}
              {msg.streaming && (
                <span
                  className="ml-1 animate-pulse text-[var(--brand-ember)]"
                  data-testid="streaming-indicator"
                >
                  ▌
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/70 p-3">
        <div className="flex gap-2">
          <textarea
            className="det-input resize-none !border-b !border-[var(--brand-rule)] disabled:cursor-not-allowed disabled:opacity-60"
            rows={2}
            placeholder={
              !projectId
                ? "Select a project…"
                : !connected
                  ? "Chat unavailable (not connected)"
                  : "Ask about this project…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming || !connected || !projectId}
            data-testid="chat-input"
          />
          <button
            className="det-btn det-btn-primary disabled:cursor-not-allowed disabled:bg-[var(--brand-rule)] disabled:text-[var(--brand-ink-soft)] disabled:shadow-none"
            onClick={handleSend}
            disabled={streaming || !connected || !projectId || !input.trim()}
            data-testid="chat-send"
          >
            Send
          </button>
        </div>
        {projectId && !connected && (
          <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-[var(--brand-ink-soft)]">
            Disconnected — check ANTHROPIC_API_KEY / Channels / Redis.
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyHint({
  title,
  body,
  testId,
}: {
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col items-start gap-1 rounded-sm border border-dashed border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/60 px-4 py-5 text-sm"
      data-testid={testId}
    >
      <span className="det-label !text-[0.6rem]">{title}</span>
      <span className="text-[var(--brand-ink-soft)]">{body}</span>
    </div>
  );
}
