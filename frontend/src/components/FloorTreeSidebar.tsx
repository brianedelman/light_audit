import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import api from "../lib/api";

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

interface FloorTreeSidebarProps {
  versionId: string;
  activeFloorId?: string;
  activeRoomId?: string;
}

export default function FloorTreeSidebar({
  versionId,
  activeFloorId,
  activeRoomId,
}: FloorTreeSidebarProps) {
  const navigate = useNavigate();
  const storageKey = `floor-tree-expanded:${versionId}`;
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as number[]);
    } catch {
      return new Set();
    }
  });

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

  // Auto-expand floor that contains active floor or active room
  useEffect(() => {
    if (!floors) return;
    const toAdd: number[] = [];
    if (activeFloorId) {
      const id = Number(activeFloorId);
      if (!Number.isNaN(id)) toAdd.push(id);
    }
    if (activeRoomId) {
      const roomId = Number(activeRoomId);
      const parent = floors.find((f) =>
        f.rooms.some((r) => r.id === roomId),
      );
      if (parent) toAdd.push(parent.id);
    }
    if (toAdd.length === 0) return;
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of toAdd) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [floors, activeFloorId, activeRoomId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(expandedFloors)),
      );
    } catch {
      /* ignore quota */
    }
  }, [expandedFloors, storageKey]);

  const toggleFloor = (floorId: number) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  return (
    <nav
      className="flex w-64 shrink-0 flex-col border-r border-(--brand-rule) bg-(--brand-paper-soft)/70"
      data-testid="floor-tree-sidebar"
    >
      <button
        type="button"
        onClick={() =>
          navigate({
            to: "/audit-versions/$versionId",
            params: { versionId },
          })
        }
        className="group border-b border-(--brand-rule) px-4 py-3 text-left transition hover:bg-(--brand-paper-deep)"
        data-testid="walkthrough-home"
      >
        <div className="det-label text-[0.6rem]!">Walkthrough</div>
        <div className="font-display text-lg font-medium tracking-tight text-(--brand-ink) group-hover:text-(--brand-ember)">
          Floors
        </div>
      </button>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="text-sm text-(--brand-ink-soft)">Loading floors…</div>
        ) : error ? (
          <div className="text-sm text-(--brand-ember)">
            Failed to load floors.
          </div>
        ) : !floors || floors.length === 0 ? (
          <div className="text-sm text-(--brand-ink-soft)">No floors.</div>
        ) : (
          <ul className="space-y-1">
            {floors.map((floor) => {
              const isFloorActive = activeFloorId === String(floor.id);
              const isExpanded = expandedFloors.has(floor.id);

              return (
                <li key={floor.id}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleFloor(floor.id)}
                      className="grid h-6 w-6 place-items-center rounded-sm font-mono text-[0.65rem] text-(--brand-ink-soft) transition hover:text-(--brand-ember)"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                      data-testid={`floor-toggle-${floor.id}`}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>
                    <button
                      onClick={() =>
                        navigate({
                          to: "/audit-versions/$versionId/floors/$floorId",
                          params: { versionId, floorId: String(floor.id) },
                        })
                      }
                      className={
                        "flex-1 rounded-sm px-2 py-1 text-left text-sm font-medium tracking-tight transition " +
                        (isFloorActive
                          ? "bg-(--brand-ink) text-(--brand-paper)"
                          : "text-(--brand-ink) hover:bg-(--brand-paper-deep)")
                      }
                      data-testid={`floor-link-${floor.id}`}
                    >
                      {floor.name}
                      {floor.level !== null && (
                        <span className="ml-2 font-mono text-[0.6rem] text-(--brand-ink-soft)">
                          L{floor.level}
                        </span>
                      )}
                    </button>
                  </div>
                  {isExpanded && floor.rooms.length > 0 && (
                    <ul className="mt-1 ml-6 space-y-0.5 border-l border-(--brand-rule) pl-3">
                      {floor.rooms.map((room) => {
                        const isRoomActive = activeRoomId === String(room.id);
                        return (
                          <li key={room.id}>
                            <button
                              onClick={() =>
                                navigate({
                                  to: "/audit-versions/$versionId/rooms/$roomId",
                                  params: {
                                    versionId,
                                    roomId: String(room.id),
                                  },
                                })
                              }
                              className={
                                "w-full rounded-sm px-2 py-1 text-left text-xs transition " +
                                (isRoomActive
                                  ? "bg-(--brand-ember)/15 text-(--brand-ember) font-medium"
                                  : "text-(--brand-ink-soft) hover:bg-(--brand-paper-deep) hover:text-(--brand-ink)")
                              }
                              data-testid={`room-link-${room.id}`}
                            >
                              {room.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
