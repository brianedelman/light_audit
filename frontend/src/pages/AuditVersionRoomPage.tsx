import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
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

interface LogEntry {
  id: number
  fixture_id: string
  qty: number
  wattage: string | null
  switch_type: string
  controls: string
  mount_type: string
  notes: string
  flag_integral_sensor: boolean
  flag_embb: boolean
  flag_air_return: boolean
  flag_wire_guard: boolean
  flag_volt_480: boolean
  flag_em_gen: boolean
  flag_photocell: boolean
  flag_twistlock_pc: boolean
  flag_wet_location: boolean
  flag_dark_sky: boolean
}

const FLAG_LABELS: { key: keyof LogEntry; label: string }[] = [
  { key: 'flag_integral_sensor', label: 'IS' },
  { key: 'flag_embb', label: 'EMBB' },
  { key: 'flag_air_return', label: 'AR' },
  { key: 'flag_wire_guard', label: 'WG' },
  { key: 'flag_volt_480', label: '480V' },
  { key: 'flag_em_gen', label: 'EMG' },
  { key: 'flag_photocell', label: 'PC' },
  { key: 'flag_twistlock_pc', label: 'TL' },
  { key: 'flag_wet_location', label: 'WL' },
  { key: 'flag_dark_sky', label: 'DS' },
]

function FlagIcons({ row }: { row: LogEntry }) {
  const active = FLAG_LABELS.filter((f) => row[f.key])
  if (active.length === 0) return <span className="text-gray-400">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {active.map((f) => (
        <span
          key={f.key as string}
          title={f.label}
          className="rounded bg-amber-100 px-1 py-0.5 text-xs font-medium text-amber-800"
        >
          {f.label}
        </span>
      ))}
    </span>
  )
}

const columnHelper = createColumnHelper<LogEntry>()

const columns = [
  columnHelper.accessor('fixture_id', {
    header: 'Fixture ID',
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('qty', {
    header: 'Qty',
  }),
  columnHelper.accessor('wattage', {
    header: 'Wattage',
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('switch_type', {
    header: 'Switch',
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('controls', {
    header: 'Controls',
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('mount_type', {
    header: 'Mount',
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.display({
    id: 'flags',
    header: 'Flags',
    cell: (info) => <FlagIcons row={info.row.original} />,
    enableSorting: false,
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => info.getValue() || '—',
    enableSorting: false,
  }),
]

function LogEntriesTable({ versionId, roomId }: { versionId: string; roomId: string }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const { data: entries = [], isLoading, error } = useQuery<LogEntry[]>({
    queryKey: ['room-log-entries', versionId, roomId],
    queryFn: async () => {
      const res = await api.get<LogEntry[]>(
        `/audit-versions/${versionId}/rooms/${roomId}/log-entries/`,
      )
      return res.data
    },
  })

  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  if (isLoading) return <div className="py-4 text-sm text-gray-500">Loading log entries…</div>
  if (error) return <div className="py-4 text-sm text-red-600">Failed to load log entries.</div>

  return (
    <div data-testid="log-entries-table">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter entries…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          data-testid="log-entries-filter"
        />
        <span className="text-sm text-gray-500">
          {table.getRowModel().rows.length} row{table.getRowModel().rows.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left font-medium text-gray-600"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && ' ↑'}
                    {header.column.getIsSorted() === 'desc' && ' ↓'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400">
                  No log entries found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
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
      <div className="flex-1 overflow-auto p-8">
        <h1 className="mb-4 text-2xl font-bold">{room.name}</h1>
        <dl className="mb-6 space-y-2 text-sm">
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
        <h2 className="mb-3 text-lg font-semibold">Log Entries</h2>
        <LogEntriesTable versionId={versionId} roomId={roomId} />
      </div>
    </div>
  )
}
