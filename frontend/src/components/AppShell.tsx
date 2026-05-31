import { useNavigate } from "@tanstack/react-router";
import { DetMark } from "./Brand";
import { useAuth } from "../context/AuthContext";

interface AppShellProps {
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export default function AppShell({ children, rightSlot }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  const onProjects = pathname.startsWith("/projects");

  return (
    <div className="relative z-[2] flex h-screen flex-col">
      <header className="relative shrink-0 border-b border-(--brand-rule) bg-(--brand-paper-soft)/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void navigate({ to: "/projects" })}
              className="group flex items-center gap-3"
            >
              <DetMark className="h-10 w-10" />
              <div className="flex flex-col leading-none">
                <span className="font-display text-2xl font-semibold tracking-tight text-(--brand-ink)">
                  DET
                </span>
                <span className="det-label mt-0.5 text-[0.6rem]!">
                  Lighting · Energy · AI
                </span>
              </div>
            </button>
            <span className="mx-3 hidden h-8 w-px bg-(--brand-rule) md:block" />
            <nav className="hidden items-center gap-1 md:flex">
              <button
                type="button"
                onClick={() => void navigate({ to: "/projects" })}
                className={
                  "rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight transition " +
                  (onProjects
                    ? "bg-(--brand-ink) text-(--brand-paper) hover:bg-(--brand-ink-soft)"
                    : "text-(--brand-ink-soft) hover:bg-(--brand-paper-deep) hover:text-(--brand-ink)")
                }
              >
                Projects
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden text-right text-xs leading-tight sm:block">
                  <div className="det-label text-[0.6rem]!">Signed in</div>
                  <div className="font-medium text-(--brand-ink)">
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                    if (typeof window !== "undefined") {
                      window.location.href = "/login";
                    }
                  }}
                  className="det-btn det-btn-ghost"
                  data-testid="logout-button"
                >
                  Log out
                </button>
              </div>
            )}
            {rightSlot}
          </div>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-(--brand-ember)/0 via-(--brand-ember)/60 to-(--brand-ember)/0" />
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
