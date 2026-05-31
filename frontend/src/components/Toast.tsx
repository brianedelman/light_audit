import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info", durationMs = 4500) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show(m, "success", d),
      error: (m, d) => show(m, "error", d ?? 7000),
      info: (m, d) => show(m, "info", d),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed top-4 right-4 z-[9999] isolate flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
        data-testid="toast-stack"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const tint =
    toast.kind === "success"
      ? "border-l-(--brand-teal) text-(--brand-ink)"
      : toast.kind === "error"
        ? "border-l-(--brand-ember) text-(--brand-ink)"
        : "border-l-(--brand-ink-soft) text-(--brand-ink)";

  const label =
    toast.kind === "success"
      ? "Success"
      : toast.kind === "error"
        ? "Error"
        : "Info";

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      style={{
        backgroundColor: "#ffffff",
        boxShadow:
          "0 1px 0 rgba(0,0,0,0.04), 0 24px 48px -16px rgba(31,45,51,0.55), 0 4px 12px -2px rgba(31,45,51,0.25)",
      }}
      className={
        "pointer-events-auto rounded-sm border border-(--brand-ink-soft) border-l-4 px-4 py-3 transition-all duration-300 ease-out " +
        tint +
        " " +
        (entered ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0")
      }
      data-testid={`toast-${toast.kind}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="det-label text-[0.6rem]!">{label}</div>
          <div className="mt-0.5 text-sm leading-snug break-words">
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-(--brand-ink-soft) hover:text-(--brand-ink)"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => undefined,
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    } satisfies ToastContextValue;
  }
  return ctx;
}
