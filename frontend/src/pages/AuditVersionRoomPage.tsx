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

export default function AuditVersionRoomPage() {
  const { versionId, roomId } = useParams({ from: '/audit-versions/$versionId/rooms/$roomId' })

  const { data: room, isLoading, error } = useQuery<Room>({
    queryKey: ['version-room', versionId, roomId],
    queryFn: async () => {
      const res = await api.get<Room>(`/audit-versions/${versionId}/rooms/${roomId}/`)
      return res.data
    },
  })

  if (isLoading) return <div className="p-8">Loading room…</div>
  if (error) return <div className="p-8 text-red-600">Failed to load room.</div>
  if (!room) return null

  return (
    <div className="flex h-full" data-testid="room-page">
      <FloorTreeSidebar versionId={versionId} activeRoomId={roomId} />
      <div className="flex-1 p-8">
        <h1 className="mb-4 text-2xl font-bold">{room.name}</h1>
        <dl className="space-y-2 text-sm">
          {room.room_type && (
            <div>
              <dt className="inline font-medium text-gray-500">Type: </dt>
              <dd className="inline">{room.room_type}</dd>
            </div>
          )}
          {room.zone_label && (
            <div>
              <dt className="inline font-medium text-gray-500">Zone: </dt>
              <dd className="inline">{room.zone_label}</dd>
            </div>
          )}
          {room.pin_code && (
            <div>
              <dt className="inline font-medium text-gray-500">Pin Code: </dt>
              <dd className="inline">{room.pin_code}</dd>
            </div>
          )}
          {room.square_feet != null && (
            <div>
              <dt className="inline font-medium text-gray-500">Square Feet: </dt>
              <dd className="inline">{room.square_feet}</dd>
            </div>
          )}
          {room.notes && (
            <div>
              <dt className="mb-1 font-medium text-gray-500">Notes:</dt>
              <dd className="whitespace-pre-wrap rounded bg-gray-50 p-2">{room.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
