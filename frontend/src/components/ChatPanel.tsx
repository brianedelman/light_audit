import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { connectWs } from "../lib/ws";
import { Starburst } from "./Brand";

interface PredefinedPrompt {
  id: number;
  name: string;
  prompt_text: string;
  agent_type: string;
}

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

interface ChatPanelProps {
  versionId: string;
}

export default function ChatPanel({ versionId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: prompts } = useQuery<PredefinedPrompt[]>({
    queryKey: ["predefined-prompts"],
    queryFn: async () => {
      const res = await api.get<PredefinedPrompt[]>("/predefined-prompts/");
      return res.data;
    },
  });

  useEffect(() => {
    const ws = connectWs(`audit-review/${versionId}/`, {
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
  }, [versionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const prompt = selectedPromptId
      ? (prompts?.find((p) => p.id === selectedPromptId)?.prompt_text ?? input)
      : input;
    if (!prompt.trim() || !wsRef.current || streaming) return;

    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    wsRef.current.send(
      JSON.stringify({ prompt, predefined_prompt_id: selectedPromptId }),
    );
    setInput("");
    setSelectedPromptId(null);
    setStreaming(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="relative flex h-full flex-col" data-testid="chat-panel">
      <div className="flex items-center justify-between border-b border-(--brand-rule) px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Starburst className="h-4 w-4 text-(--brand-ember)" />
          <div>
            <div className="det-label text-[0.6rem]!">Claude API · Chat-bot</div>
            <div className="font-display text-base font-medium tracking-tight text-(--brand-ink)">
              Audit review
            </div>
          </div>
        </div>
        <span
          className={
            "det-chip " +
            (connected
              ? "border-(--brand-teal)/60 text-(--brand-teal)"
              : "border-(--brand-ember)/60 text-(--brand-ember)")
          }
          data-testid={!connected ? "chat-disconnected" : undefined}
        >
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (connected
                ? "bg-(--brand-teal)"
                : "animate-pulse bg-(--brand-ember)")
            }
          />
          {connected ? "live" : "connecting"}
        </span>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        data-testid="chat-messages"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-1 rounded-sm border border-dashed border-(--brand-rule) bg-(--brand-paper-soft)/60 px-4 py-5 text-sm">
            <span className="det-label text-[0.6rem]!">Prompt the auditor</span>
            <span className="text-(--brand-ink-soft)">
              Try: “Highlight rooms missing photos” or pick a saved prompt
              below.
            </span>
          </div>
        )}
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
                  ? "bg-(--brand-ink) text-(--brand-paper)"
                  : "border border-(--brand-rule) bg-(--brand-paper-soft) text-(--brand-ink)")
              }
            >
              {msg.content}
              {msg.streaming && (
                <span
                  className="ml-1 animate-pulse text-(--brand-ember)"
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

      <div className="space-y-2 border-t border-(--brand-rule) bg-(--brand-paper-soft)/70 p-3">
        {prompts && prompts.length > 0 && (
          <select
            className="det-input cursor-pointer"
            value={selectedPromptId ?? ""}
            onChange={(e) =>
              setSelectedPromptId(e.target.value ? Number(e.target.value) : null)
            }
            data-testid="predefined-prompt-select"
          >
            <option value="">— Select a predefined prompt —</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <textarea
            className="det-input resize-none disabled:cursor-not-allowed disabled:opacity-60"
            rows={2}
            placeholder={
              !connected
                ? "Chat unavailable (not connected)"
                : "Ask about this audit…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming || !connected}
            data-testid="chat-input"
          />
          <button
            className="det-btn det-btn-primary disabled:cursor-not-allowed disabled:bg-(--brand-rule) disabled:text-(--brand-ink-soft) disabled:shadow-none"
            onClick={handleSend}
            disabled={streaming || !connected || (!input.trim() && !selectedPromptId)}
            data-testid="chat-send"
          >
            Send
          </button>
        </div>
        {!connected && (
          <p className="font-mono text-[0.65rem] tracking-widest text-(--brand-ink-soft) uppercase">
            Disconnected — check ANTHROPIC_API_KEY / Channels / Redis.
          </p>
        )}
      </div>
    </div>
  );
}
