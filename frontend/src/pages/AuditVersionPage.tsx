import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import api from "../lib/api";
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

export default function AuditVersionPage() {
  const { versionId } = useParams({ strict: false }) as { versionId: string };

  const {
    data: version,
    isLoading,
    error,
  } = useQuery<AuditVersion>({
    queryKey: ["audit-version", versionId],
    queryFn: async () => {
      const res = await api.get<AuditVersion>(`/audit-versions/${versionId}/`);
      return res.data;
    },
  });

  if (isLoading)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10 text-sm text-(--brand-ink-soft)"
        data-testid="audit-version-page"
      >
        Loading version…
      </div>
    );
  if (error)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10"
        data-testid="audit-version-page"
      >
        <div className="det-card border-l-4 border-l-(--brand-ember) rounded-sm p-6 text-sm">
          Failed to load version.
        </div>
      </div>
    );
  if (!version) return null;

  return (
    <div
      className="flex flex-1 flex-col gap-8 p-10"
      data-testid="audit-version-page"
    >
      <section className="det-card relative rounded-sm p-8">
        <Starburst className="pointer-events-none absolute top-6 right-6 h-14 w-14 text-(--brand-ember)/30" />
        <div className="det-label">Audit snapshot</div>
        <h1 className="mt-2 font-display text-4xl font-medium leading-none tracking-tight text-(--brand-ink)">
          Version {version.version_number}
        </h1>
        {version.label && (
          <div className="mt-2 font-mono text-sm text-(--brand-ember)">
            {version.label}
          </div>
        )}
        <dl className="mt-6 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-4">
          <Fact label="Status" value={version.status.replace(/_/g, " ")} />
          {version.created_by_name && (
            <Fact label="Created by" value={version.created_by_name} />
          )}
          <Fact
            label="Created"
            value={new Date(version.created).toLocaleDateString()}
            mono
          />
          {version.is_current && (
            <div>
              <div className="det-label">State</div>
              <span className="det-chip mt-1 border-(--brand-teal)/60 text-(--brand-teal)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--brand-teal)" />
                Current
              </span>
            </div>
          )}
        </dl>
      </section>

      <section className="det-card flex flex-col items-center justify-center rounded-sm p-12 text-center">
        <Starburst className="h-12 w-12 text-(--brand-ember)/60" />
        <h2 className="mt-4 font-display text-2xl font-medium tracking-tight text-(--brand-ink)">
          Pick a floor
        </h2>
        <p className="mt-2 max-w-md text-sm text-(--brand-ink-soft)">
          Select a floor from the sidebar to inspect rooms, log entries, and
          photos captured during the walkthrough. Export buttons live in the
          header above.
        </p>
      </section>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="det-label">{label}</div>
      <div
        className={
          "mt-1 capitalize " +
          (mono
            ? "font-mono text-sm text-(--brand-ink)"
            : "text-sm font-medium text-(--brand-ink)")
        }
      >
        {value}
      </div>
    </div>
  );
}
