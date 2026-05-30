import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "../context/AuthContext";
import { DetMark, Starburst, Boomerang, Diamond } from "../components/Brand";

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      void navigate({ to: "/" });
    }
  }, [user, isLoading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      void navigate({ to: "/" });
    } catch {
      setError("Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative z-[2] grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left — brand stage */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--brand-ink)] p-12 text-[var(--brand-paper)] lg:flex">
        {/* atomic decoration */}
        <Starburst className="absolute -top-10 -left-10 h-56 w-56 text-[var(--brand-ember)]/35" />
        <Starburst className="absolute bottom-20 right-16 h-24 w-24 text-[var(--brand-teal)]/45 det-spin-slow" />
        <Boomerang className="absolute right-0 top-1/3 h-32 w-64 text-[var(--brand-ember)]/55" />
        <Diamond className="absolute bottom-10 left-16 h-20 w-12 text-[var(--brand-teal)]/40" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--brand-paper) 1px, transparent 1px), linear-gradient(90deg, var(--brand-paper) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10 flex items-center gap-4">
          <DetMark className="h-14 w-14" />
          <div>
            <div className="font-display text-3xl font-semibold tracking-tight">
              DET
            </div>
            <div className="det-label !text-[var(--brand-teal-soft)]">
              Consult · Manage · Optimize
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md det-rise det-rise-1">
          <div className="det-label !text-[var(--brand-ember-soft)] mb-3">
            Our Mission
          </div>
          <h2 className="font-display text-5xl font-medium leading-[1.05] tracking-tight">
            Smarter lighting solutions,
            <br />
            <span className="text-[var(--brand-ember)]">powered by AI.</span>
            <br />
            Built for better futures.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--brand-paper)]/70">
            The light auditing platform — capture rooms in the field, review on
            the web, recommend with confidence.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[0.65rem] uppercase tracking-[0.18em] text-[var(--brand-paper)]/55">
          <span>Lighting Experts</span>
          <Diamond className="h-3 w-2 text-[var(--brand-ember)]" />
          <span>Energy Efficiency</span>
          <Diamond className="h-3 w-2 text-[var(--brand-ember)]" />
          <span>AI Insights</span>
        </div>
      </aside>

      {/* Right — sign in card */}
      <main className="flex items-center justify-center px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="det-card det-rise det-rise-2 w-full max-w-md rounded-sm px-10 py-12"
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <div className="det-label">Restricted access</div>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--brand-ink)]">
                Sign in
              </h1>
            </div>
            <Starburst className="h-10 w-10 text-[var(--brand-ember)]/70" />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-sm border-l-2 border-[var(--brand-ember)] bg-[var(--brand-ember)]/10 px-3 py-2 text-sm text-[var(--brand-ink)]"
            >
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="det-label mb-1.5 block">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="det-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="det-label mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="det-input"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="det-btn det-btn-primary mt-7 w-full py-3 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
            <Diamond className="h-3 w-2 text-[var(--brand-paper)]" />
          </button>

          <div className="mt-6 flex items-center justify-between text-xs text-[var(--brand-ink-soft)]">
            <a
              href="/password-reset"
              className="hover:text-[var(--brand-ember)] hover:underline"
            >
              Forgot password?
            </a>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em]">
              DET · v1
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
