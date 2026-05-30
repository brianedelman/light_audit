import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import api from "../lib/api";
import ProjectChatPanel from "../components/ProjectChatPanel";
import AppShell from "../components/AppShell";
import { Diamond, Starburst } from "../components/Brand";

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

interface Building {
  id: number;
  name: string;
  address: string;
  building_type: string;
  square_feet: number | null;
  created: string;
  modified: string;
}

interface AuditVersion {
  id: number;
  version_number: number;
  label: string;
  status: string;
  created_by_name: string;
  is_current: boolean;
  created: string;
  modified: string;
}

function ActionButtons({
  version,
  buildingId,
}: {
  version: AuditVersion;
  buildingId: number;
}) {
  const queryClient = useQueryClient();

  const pushMutation = useMutation({
    mutationFn: () => api.post(`/audit-versions/${version.id}/push-to-ipad/`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["building-versions", buildingId],
      }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.post(`/audit-versions/${version.id}/duplicate/`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["building-versions", buildingId],
      }),
  });

  return (
    <div className="flex gap-2">
      <button
        onClick={() => pushMutation.mutate()}
        disabled={
          pushMutation.isPending || version.status === "published_to_ipad"
        }
        className="det-btn det-btn-primary !px-2.5 !py-1 !text-[0.7rem] uppercase tracking-[0.1em] disabled:opacity-50"
        data-testid={`push-ipad-${version.id}`}
      >
        {pushMutation.isPending ? "Pushing…" : "Push iPad"}
      </button>
      <button
        onClick={() => duplicateMutation.mutate()}
        disabled={duplicateMutation.isPending}
        className="det-btn det-btn-ghost !px-2.5 !py-1 !text-[0.7rem] uppercase tracking-[0.1em] disabled:opacity-50"
        data-testid={`duplicate-${version.id}`}
      >
        {duplicateMutation.isPending ? "Duplicating…" : "Duplicate"}
      </button>
    </div>
  );
}

const STATUS_TINT: Record<string, string> = {
  draft:
    "text-[var(--brand-ink-soft)] border-[var(--brand-rule)] bg-[var(--brand-paper-deep)]",
  in_review:
    "text-[var(--brand-ember)] border-[var(--brand-ember)]/60 bg-[var(--brand-ember)]/8",
  published_to_ipad:
    "text-[var(--brand-teal)] border-[var(--brand-teal)]/60 bg-[var(--brand-teal)]/10",
  completed:
    "text-[var(--brand-ink)] border-[var(--brand-ink)] bg-[var(--brand-ink)]/5",
};

function VersionStatusChip({ status }: { status: string }) {
  const tint = STATUS_TINT[status] ?? STATUS_TINT.draft;
  return (
    <span className={"det-chip " + tint}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

const columnHelper = createColumnHelper<AuditVersion>();

function makeColumns(buildingId: number) {
  return [
    columnHelper.accessor("version_number", {
      header: "#",
      size: 60,
      cell: (info) => (
        <span className="font-mono text-[var(--brand-ember)]">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("label", {
      header: "Label",
      cell: (info) => (
        <span className="font-medium text-[var(--brand-ink)]">
          {info.getValue() || "—"}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => <VersionStatusChip status={info.getValue()} />,
    }),
    columnHelper.accessor("created_by_name", {
      header: "Created by",
      cell: (info) => (
        <span className="text-[var(--brand-ink-soft)]">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("created", {
      header: "Created",
      cell: (info) => (
        <span className="font-mono text-xs text-[var(--brand-ink-soft)]">
          {new Date(info.getValue()).toLocaleDateString()}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <ActionButtons version={info.row.original} buildingId={buildingId} />
      ),
    }),
  ];
}

function BuildingVersionsTable({ buildingId }: { buildingId: number }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = makeColumns(buildingId);

  const { data: versions, isLoading } = useQuery<AuditVersion[]>({
    queryKey: ["building-versions", buildingId],
    queryFn: async () => {
      const res = await api.get<AuditVersion[]>(
        `/buildings/${buildingId}/audit-versions/`,
      );
      return res.data;
    },
  });

  const table = useReactTable({
    data: versions ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading)
    return (
      <div className="px-4 py-3 text-xs text-[var(--brand-ink-soft)]">
        Loading versions…
      </div>
    );

  if (!versions || versions.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-[var(--brand-ink-soft)]">
        No audit versions captured for this building yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <table
        className="w-full border-collapse text-left text-sm"
        data-testid={`versions-table-${buildingId}`}
      >
        <thead className="bg-[var(--brand-paper-deep)]/60">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="border-b border-[var(--brand-rule)]"
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="det-label cursor-pointer px-4 py-2 !text-[0.6rem]"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{ asc: " ↑", desc: " ↓" }[
                    header.column.getIsSorted() as string
                  ] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[var(--brand-rule)]/60 transition hover:bg-[var(--brand-paper-deep)]/40"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(
    new Set(),
  );

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await api.get<Project>(`/projects/${projectId}/`);
      return res.data;
    },
  });

  const { data: buildings, isLoading: buildingsLoading } = useQuery<Building[]>(
    {
      queryKey: ["project-buildings", projectId],
      queryFn: async () => {
        const res = await api.get<Building[]>(
          `/projects/${projectId}/buildings/`,
        );
        return res.data;
      },
    },
  );

  const toggleBuilding = (id: number) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (projectLoading)
    return (
      <AppShell breadcrumbs={[{ label: "Projects", to: "/projects" }]}>
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--brand-ink-soft)]">
          Loading project…
        </div>
      </AppShell>
    );

  if (projectError)
    return (
      <AppShell breadcrumbs={[{ label: "Projects", to: "/projects" }]}>
        <div className="flex flex-1 items-center justify-center">
          <div className="det-card border-l-4 border-l-[var(--brand-ember)] rounded-sm p-6 text-sm">
            <p>Failed to load project.</p>
          </div>
        </div>
      </AppShell>
    );

  if (!project) return null;

  return (
    <AppShell breadcrumbs={[{ label: "Projects", to: "/projects" }]}>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Hero */}
        <section className="relative shrink-0 border-b border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/60 px-10 pt-10 pb-8">
          <Starburst className="absolute right-10 top-8 h-16 w-16 text-[var(--brand-ember)]/40 det-spin-slow" />
          <div className="det-label det-rise">Project file</div>
          <h1 className="mt-2 font-display text-5xl font-medium leading-none tracking-tight text-[var(--brand-ink)] det-rise det-rise-1">
            {project.name}
          </h1>

          <div className="mt-6 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-3 text-sm det-rise det-rise-2 sm:grid-cols-4">
            <Fact label="Client" value={project.client || "—"} />
            <Fact label="Type" value={project.project_type} mono />
            <Fact label="Status" value={project.status.replace(/_/g, " ")} />
            <Fact
              label="Buildings"
              value={String(project.building_count)}
              accent
            />
          </div>
        </section>

        {/* Buildings */}
        <section className="min-h-0 flex-1 overflow-auto px-10 py-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <div className="det-label">Site directory</div>
              <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-[var(--brand-ink)]">
                Buildings
              </h2>
            </div>
            <span className="font-mono text-xs text-[var(--brand-ink-soft)]">
              {buildings?.length ?? 0} entries
            </span>
          </div>

          {buildingsLoading ? (
            <div className="text-sm text-[var(--brand-ink-soft)]">
              Loading buildings…
            </div>
          ) : !buildings || buildings.length === 0 ? (
            <div className="det-card rounded-sm p-10 text-center text-sm text-[var(--brand-ink-soft)]">
              No buildings found.
            </div>
          ) : (
            <ul className="grid gap-3 det-rise det-rise-3">
              {buildings.map((building) => {
                const open = expandedBuildings.has(building.id);
                return (
                  <li key={building.id} className="det-card rounded-sm">
                    <button
                      onClick={() => toggleBuilding(building.id)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[var(--brand-paper-deep)]/40"
                      data-testid={`building-row-${building.id}`}
                    >
                      <span
                        className={
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--brand-rule)] font-mono text-[0.6rem] uppercase text-[var(--brand-ink-soft)] transition " +
                          (open
                            ? "rotate-90 border-[var(--brand-ember)] text-[var(--brand-ember)]"
                            : "")
                        }
                      >
                        ▸
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-display text-lg font-medium tracking-tight text-[var(--brand-ink)]">
                            {building.name}
                          </span>
                          {building.building_type && (
                            <span className="det-chip border-[var(--brand-rule)] text-[var(--brand-ink-soft)]">
                              {building.building_type}
                            </span>
                          )}
                        </div>
                        {building.address && (
                          <div className="mt-0.5 text-xs text-[var(--brand-ink-soft)]">
                            {building.address}
                          </div>
                        )}
                      </div>
                      <div className="hidden items-center gap-5 text-right md:flex">
                        {building.square_feet != null && (
                          <div>
                            <div className="font-mono text-sm text-[var(--brand-ink)]">
                              {building.square_feet.toLocaleString()}
                            </div>
                            <div className="det-label !text-[0.55rem]">
                              sqft
                            </div>
                          </div>
                        )}
                        <Diamond className="h-3 w-2 text-[var(--brand-ember)]/60" />
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-[var(--brand-rule)] bg-[var(--brand-paper)]/40">
                        <div className="border-b border-[var(--brand-rule)]/60 px-5 py-2 det-label">
                          Audit versions
                        </div>
                        <BuildingVersionsTable buildingId={building.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <aside className="hidden w-[26rem] shrink-0 border-l border-[var(--brand-rule)] bg-[var(--brand-paper-soft)]/70 lg:block">
        <ProjectChatPanel projectId={projectId} />
      </aside>
    </AppShell>
  );
}

function Fact({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="det-label">{label}</div>
      <div
        className={
          "mt-1 capitalize " +
          (accent
            ? "font-display text-2xl font-medium text-[var(--brand-ember)]"
            : mono
              ? "font-mono text-sm text-[var(--brand-ink)]"
              : "text-sm font-medium text-[var(--brand-ink)]")
        }
      >
        {value}
      </div>
    </div>
  );
}
