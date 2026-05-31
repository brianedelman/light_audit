import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "@tanstack/react-router";
import api from "../lib/api";
import { Diamond } from "../components/Brand";

interface Room {
  id: number;
  name: string;
  room_type: string;
  zone_label: string;
  pin_code: string;
  square_feet: number | null;
  notes: string;
  created: string;
  modified: string;
}

interface Floor {
  id: number;
  name: string;
  level: number | null;
  sort_order: number;
  rooms: Room[];
  created: string;
  modified: string;
}

export default function AuditVersionFloorPage() {
  const { versionId, floorId } = useParams({ strict: false }) as {
    versionId: string;
    floorId: string;
  };
  const navigate = useNavigate();

  const {
    data: floors,
    isLoading,
    error,
  } = useQuery<Floor[]>({
    queryKey: ["version-floors", versionId],
    queryFn: async () => {
      const res = await api.get<Floor[]>(`/audit-versions/${versionId}/floors/`);
      return res.data;
    },
  });

  const floor = floors?.find((f) => String(f.id) === floorId);

  if (isLoading)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10 text-sm text-(--brand-ink-soft)"
        data-testid="floor-page"
      >
        Loading…
      </div>
    );
  if (error)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10"
        data-testid="floor-page"
      >
        <div className="det-card border-l-4 border-l-(--brand-ember) rounded-sm p-6 text-sm">
          Failed to load floors.
        </div>
      </div>
    );
  if (!floor)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10 text-sm text-(--brand-ink-soft)"
        data-testid="floor-page"
      >
        Floor not found.
      </div>
    );

  return (
    <div className="flex flex-1 flex-col" data-testid="floor-page">
      <section className="shrink-0 border-b border-(--brand-rule) bg-(--brand-paper-soft)/40 px-10 pt-8 pb-5">
        <div className="det-label">Floor</div>
        <div className="mt-2 flex items-end justify-between gap-6">
          <h1 className="font-display text-3xl font-medium leading-none tracking-tight text-(--brand-ink)">
            {floor.name}
          </h1>
          {floor.level !== null && (
            <div className="text-right">
              <div className="det-label">Level</div>
              <div className="font-mono text-2xl text-(--brand-ember)">
                {floor.level}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto px-10 py-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="det-label">Walkthrough</div>
            <h2 className="mt-1 font-display text-xl font-medium tracking-tight text-(--brand-ink)">
              Rooms
            </h2>
          </div>
          <span className="font-mono text-xs text-(--brand-ink-soft)">
            {floor.rooms.length} entries
          </span>
        </div>

        {floor.rooms.length === 0 ? (
          <div className="det-card rounded-sm p-10 text-center text-sm text-(--brand-ink-soft)">
            No rooms on this floor.
          </div>
        ) : (
          <ul className="grid gap-2">
            {floor.rooms.map((room, i) => (
              <li
                key={room.id}
                onClick={() =>
                  navigate({
                    to: "/audit-versions/$versionId/rooms/$roomId",
                    params: { versionId, roomId: String(room.id) },
                  })
                }
                className="det-card group grid cursor-pointer grid-cols-[60px_1fr_auto] items-center gap-5 rounded-sm px-4 py-3 transition hover:-translate-y-px hover:border-(--brand-ember)/60"
              >
                <span className="font-mono text-xs text-(--brand-ember)">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-lg font-medium tracking-tight text-(--brand-ink) group-hover:text-(--brand-ember)">
                      {room.name}
                    </span>
                    {room.room_type && (
                      <span className="det-chip border-(--brand-rule) text-(--brand-ink-soft)">
                        {room.room_type}
                      </span>
                    )}
                    {room.pin_code && (
                      <span className="font-mono text-[0.7rem] text-(--brand-ink-soft)">
                        #{room.pin_code}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {room.square_feet != null && (
                    <div className="text-right">
                      <div className="font-mono text-sm text-(--brand-ink)">
                        {room.square_feet}
                      </div>
                      <div className="det-label text-[0.55rem]!">sqft</div>
                    </div>
                  )}
                  <Diamond className="h-3 w-2 text-(--brand-ember)/60" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
