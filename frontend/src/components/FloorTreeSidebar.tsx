import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import api from '../lib/api'

interface Room {
  id: number
  name: string
  room_type: string
  zone_label: string
  pin_code: string
  square_feet: number | null
  notes: string
  created: string
  modified: string
}

interface Floor {
  id: number
  name: string
  level: number | null
  sort_order: number
  rooms: Room[]
  created: string
  modified: string
}

interface FloorTreeSidebarProps {
  versionId: string
  activeFloorId?: string
  activeRoomId?: string
}

export default function FloorTreeSidebar({ versionId, activeFloorId, activeRoomId }: FloorTreeSidebarProps) {
  const navigate = useNavigate()
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set())

  const { data: floors, isLoading, error } = useQuery<Floor[]>({
    queryKey: ['version-floors', versionId],
    queryFn: async () => {
      const res = await api.get<Floor[]>(`/audit-versions/${versionId}/floors/`)
      return res.data
    },
  })

  const toggleFloor = (floorId: number) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(floorId)) next.delete(floorId)
      else next.add(floorId)
      return next
    })
  }

  if (isLoading) return <div className="p-4 text-sm text-gray-400">Loading floors…</div>
  if (error) return <div className="p-4 text-sm text-red-500">Failed to load floors.</div>
  if (!floors || floors.length === 0) return <div className="p-4 text-sm text-gray-400">No floors.</div>

  return (
    <nav className="w-56 shrink-0 border-r bg-gray-50 p-3" data-testid="floor-tree-sidebar">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Floors</div>
      <ul className="space-y-1">
        {floors.map((floor) => {
          const isFloorActive = activeFloorId === String(floor.id)
          const isExpanded = expandedFloors.has(floor.id)

          return (
            <li key={floor.id}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleFloor(floor.id)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  data-testid={`floor-toggle-${floor.id}`}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
                <button
                  onClick={() =>
                    navigate({
                      to: '/audit-versions/$versionId/floors/$floorId',
                      params: { versionId, floorId: String(floor.id) },
                    })
                  }
                  className={`flex-1 rounded px-2 py-1 text-left text-sm hover:bg-gray-200 ${
                    isFloorActive ? 'bg-blue-100 font-medium text-blue-700' : 'text-gray-700'
                  }`}
                  data-testid={`floor-link-${floor.id}`}
                >
                  {floor.name}
                </button>
              </div>
              {isExpanded && floor.rooms.length > 0 && (
                <ul className="ml-6 mt-1 space-y-0.5">
                  {floor.rooms.map((room) => {
                    const isRoomActive = activeRoomId === String(room.id)
                    return (
                      <li key={room.id}>
                        <button
                          onClick={() =>
                            navigate({
                              to: '/audit-versions/$versionId/rooms/$roomId',
                              params: { versionId, roomId: String(room.id) },
                            })
                          }
                          className={`w-full rounded px-2 py-0.5 text-left text-xs hover:bg-gray-200 ${
                            isRoomActive ? 'bg-blue-100 font-medium text-blue-700' : 'text-gray-600'
                          }`}
                          data-testid={`room-link-${room.id}`}
                        >
                          {room.name}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
