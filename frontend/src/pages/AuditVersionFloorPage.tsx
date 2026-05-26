import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import api from '../lib/api'
import FloorTreeSidebar from '../components/FloorTreeSidebar'

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

export default function AuditVersionFloorPage() {
  const { versionId, floorId } = useParams({ from: '/audit-versions/$versionId/floors/$floorId' })

  const { data: floors, isLoading, error } = useQuery<Floor[]>({
    queryKey: ['version-floors', versionId],
    queryFn: async () => {
      const res = await api.get<Floor[]>(`/audit-versions/${versionId}/floors/`)
      return res.data
    },
  })

  const floor = floors?.find((f) => String(f.id) === floorId)

  if (isLoading) return <div className="p-8">Loading…</div>
  if (error) return <div className="p-8 text-red-600">Failed to load floors.</div>
  if (!floor) return <div className="p-8 text-gray-500">Floor not found.</div>

  return (
    <div className="flex h-full" data-testid="floor-page">
      <FloorTreeSidebar versionId={versionId} activeFloorId={floorId} />
      <div className="flex-1 p-8">
        <h1 className="mb-4 text-2xl font-bold">{floor.name}</h1>
        {floor.level !== null && (
          <p className="mb-4 text-sm text-gray-500">Level: {floor.level}</p>
        )}
        <h2 className="mb-3 text-lg font-semibold">Rooms</h2>
        {floor.rooms.length === 0 ? (
          <p className="text-gray-500">No rooms on this floor.</p>
        ) : (
          <ul className="space-y-2">
            {floor.rooms.map((room) => (
              <li key={room.id} className="rounded border px-4 py-2 text-sm">
                <span className="font-medium">{room.name}</span>
                {room.room_type && (
                  <span className="ml-3 text-gray-500">{room.room_type}</span>
                )}
                {room.square_feet != null && (
                  <span className="ml-3 text-gray-500">{room.square_feet} sq ft</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
