import { useQuery } from "@tanstack/react-query";
import { Outlet, useParams } from "@tanstack/react-router";
import api from "../lib/api";
import AppShell from "../components/AppShell";
import FloorTreeSidebar from "../components/FloorTreeSidebar";
import ChatPanel from "../components/ChatPanel";
import ExportButtons from "../components/ExportButtons";
import { Starburst } from "../components/Brand";

interface AuditVersion {
  id: number;
  version_number: number;
  label: string;
  status: string;
  is_current: boolean;
  created_by_name: string;
  created: string;
  modified: string;
}

export default function AuditVersionLayout() {
  const { versionId } = useParams({ strict: false }) as { versionId: string };
  const activeFloorId = (useParams({ strict: false }) as { floorId?: string })
    .floorId;
  const activeRoomId = (useParams({ strict: false }) as { roomId?: string })
    .roomId;

  const { data: version } = useQuery<AuditVersion>({
    queryKey: ["audit-version", versionId],
    queryFn: async () => {
      const res = await api.get<AuditVersion>(`/audit-versions/${versionId}/`);
      return res.data;
    },
  });

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1" data-testid="audit-version-layout">
        <FloorTreeSidebar
          versionId={versionId}
          activeFloorId={activeFloorId}
          activeRoomId={activeRoomId}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <section className="relative shrink-0 overflow-hidden border-b border-(--brand-rule) bg-(--brand-paper-soft)/60 px-8 py-4">
            <Starburst className="det-spin-slow pointer-events-none absolute -top-6 -left-6 z-0 h-20 w-20 text-(--brand-teal)/20" />
            <div className="relative z-10 flex items-center justify-between gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-3">
                  <a
                    href={`/audit-versions/${versionId}`}
                    className="group flex flex-col"
                  >
                    <span className="det-label text-[0.6rem]!">Audit</span>
                    <span className="font-display text-xl font-medium tracking-tight text-(--brand-ink) group-hover:text-(--brand-ember)">
                      Version {version?.version_number ?? "—"}
                    </span>
                  </a>
                  {version?.label && (
                    <span className="font-mono text-sm text-(--brand-ember) leading-6">
                      {version.label}
                    </span>
                  )}
                </div>
                {(version?.is_current || version) && (
                  <div className="flex flex-wrap items-end gap-2">
                    {version?.is_current && (
                      <span className="det-chip border-(--brand-teal)/60 text-(--brand-teal)">
                        <span className="h-1.5 w-1.5 rounded-full bg-(--brand-teal)" />
                        Current
                      </span>
                    )}
                    {version && (
                      <span className="det-chip border-(--brand-rule) text-(--brand-ink-soft) capitalize">
                        {version.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ExportButtons versionId={versionId} />
            </div>
          </section>

          <div className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>

        <aside className="hidden w-[24rem] shrink-0 border-l border-(--brand-rule) bg-(--brand-paper-soft)/70 lg:block">
          <ChatPanel versionId={versionId} />
        </aside>
      </div>
    </AppShell>
  );
}
