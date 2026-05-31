import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import api from "../lib/api";
import ProjectChatPanel from "../components/ProjectChatPanel";
import AppShell from "../components/AppShell";
import { Starburst, Diamond } from "../components/Brand";

interface Project {
  id: number;
  name: string;
  client: string;
  project_type: string;
  status: string;
  building_count: number;
  created: string;
  modified: string;
}

const STATUS_TINT: Record<string, string> = {
  active: "text-[var(--brand-ember)] border-[var(--brand-ember)]/60 bg-[var(--brand-ember)]/8",
  draft: "text-[var(--brand-ink-soft)] border-[var(--brand-rule)] bg-[var(--brand-paper-deep)]",
  completed: "text-[var(--brand-teal)] border-[var(--brand-teal)]/60 bg-[var(--brand-teal)]/10",
  archived: "text-[var(--brand-ink-soft)]/70 border-[var(--brand-rule)] bg-transparent",
};

function StatusChip({ status }: { status: string }) {
  const key = status.toLowerCase();
  const tint = STATUS_TINT[key] ?? STATUS_TINT.draft;
  return (
    <span className={"det-chip " + tint}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");
  const {
    data: projects,
    isLoading,
    error,
  } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api.get<Project[]>("/projects/");
      return res.data;
    },
  });

  const filtered = projects?.filter(
    (p) => filter === "all" || p.status.toLowerCase() === filter,
  );

  const statuses = Array.from(
    new Set((projects ?? []).map((p) => p.status.toLowerCase())),
  );

  return (
    <AppShell>
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Page header */}
        <section className="relative shrink-0 border-b border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/60 px-10 pt-10 pb-6">
          <Starburst className="pointer-events-none absolute right-10 top-6 h-20 w-20 text-[var(--brand-teal)]/30 det-spin-slow" />
          <div className="det-label det-rise">All engagements</div>
          <div className="mt-2 flex items-end justify-between gap-6 det-rise det-rise-1">
            <h1 className="font-display text-5xl font-medium leading-none tracking-tight text-[var(--brand-ink)]">
              Projects
            </h1>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 det-rise det-rise-2">
            <FilterPill
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="All"
              count={projects?.length}
            />
            {statuses.map((s) => (
              <FilterPill
                key={s}
                active={filter === s}
                onClick={() => setFilter(s)}
                label={s.replace(/_/g, " ")}
                count={
                  projects?.filter((p) => p.status.toLowerCase() === s).length
                }
              />
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto px-10 py-8">
          {isLoading ? (
            <SkeletonRows />
          ) : error ? (
            <ErrorBlock />
          ) : !filtered || filtered.length === 0 ? (
            <EmptyBlock />
          ) : (
            <ul className="grid gap-3 det-rise det-rise-3">
              {filtered.map((project, i) => (
                <li
                  key={project.id}
                  onClick={() =>
                    navigate({
                      to: "/projects/$projectId",
                      params: { projectId: String(project.id) },
                    })
                  }
                  className="group det-card relative grid cursor-pointer grid-cols-[80px_1fr_auto] items-center gap-6 rounded-sm px-5 py-4 transition hover:-translate-y-px hover:border-[var(--brand-ember)]/60 hover:shadow-[0_18px_36px_-22px_rgba(217,108,58,0.5)]"
                  data-testid={`project-row-${project.id}`}
                >
                  <div className="flex items-center gap-3 font-mono text-xs text-[var(--brand-ink-soft)]">
                    <span className="text-[var(--brand-ember)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="h-px w-6 bg-[var(--brand-rule)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate font-display text-xl font-medium tracking-tight text-[var(--brand-ink)] group-hover:text-[var(--brand-ember)]">
                        {project.name}
                      </h3>
                      <StatusChip status={project.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--brand-ink-soft)]">
                      <span>
                        <span className="det-label !text-[0.6rem]">
                          Client
                        </span>{" "}
                        <span className="font-medium text-[var(--brand-ink)]">
                          {project.client || "—"}
                        </span>
                      </span>
                      <Diamond className="h-2.5 w-1.5 text-[var(--brand-rule)]" />
                      <span className="capitalize">
                        {project.project_type || "—"}
                      </span>
                      <Diamond className="h-2.5 w-1.5 text-[var(--brand-rule)]" />
                      <span>
                        {new Date(project.modified).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="font-display text-3xl font-medium leading-none text-[var(--brand-ink)]">
                        {project.building_count}
                      </div>
                      <div className="det-label !text-[0.6rem] mt-1">
                        Buildings
                      </div>
                    </div>
                    <span className="font-mono text-lg text-[var(--brand-ink-soft)] transition group-hover:translate-x-1 group-hover:text-[var(--brand-ember)]">
                      →
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <aside className="hidden w-[26rem] shrink-0 border-l border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/70 lg:block">
        <ProjectChatPanel projectId={null} />
      </aside>
    </AppShell>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "det-chip cursor-pointer transition " +
        (active
          ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-[var(--brand-paper)]"
          : "border-[var(--brand-rule)] text-[var(--brand-ink-soft)] hover:border-[var(--brand-ink-soft)] hover:text-[var(--brand-ink)]")
      }
    >
      <span>
        {label}
        {count !== undefined ? ` · ${count}` : ""}
      </span>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="det-card animate-pulse rounded-sm px-5 py-6 opacity-50"
        >
          <div className="h-4 w-1/3 rounded bg-[var(--brand-rule)]/40" />
          <div className="mt-3 h-3 w-1/2 rounded bg-[var(--brand-rule)]/30" />
        </div>
      ))}
    </div>
  );
}

function ErrorBlock() {
  return (
    <div className="det-card border-l-4 border-l-[var(--brand-ember)] rounded-sm p-6">
      <p className="text-sm">Failed to load projects.</p>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="det-card flex flex-col items-center justify-center rounded-sm py-20 text-center">
      <Starburst className="h-16 w-16 text-[var(--brand-ember)]/50" />
      <h3 className="mt-4 font-display text-2xl font-medium text-[var(--brand-ink)]">
        No projects found.
      </h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--brand-ink-soft)]">
        Start by importing an audit from the field or creating a project from
        scratch.
      </p>
    </div>
  );
}
