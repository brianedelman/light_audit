import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import PanoramaViewer from '../components/PanoramaViewer'

interface Photo {
  id: number
  photo_type: string
  public_url: string
  thumbnail_url: string
  space_name: string
  notes: string
  taken_at: string | null
  mime_type: string
  width: number | null
  height: number | null
}

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

interface AuditFlag {
  id: number
  log_entry_id: number
  severity: 'info' | 'warn' | 'critical'
  message: string
  status: 'active' | 'dismissed'
  dismissed_reason: string
  dismissed_at: string | null
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

const SEVERITY_CLASSES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warn: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
}

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

function AuditFlagBadges({
  flags,
  onSelect,
}: {
  flags: AuditFlag[]
  onSelect: (flag: AuditFlag) => void
}) {
  if (flags.length === 0) return <span className="text-gray-400">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <button
          key={flag.id}
          onClick={() => onSelect(flag)}
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[flag.severity] ?? 'bg-gray-100 text-gray-800'} ${flag.status === 'dismissed' ? 'opacity-50 line-through' : ''}`}
          data-testid={`audit-flag-badge-${flag.id}`}
          title={flag.message}
        >
          {flag.severity}
        </button>
      ))}
    </span>
  )
}

interface FlagDetailPanelProps {
  flag: AuditFlag
  onClose: () => void
  onDismissSuccess: () => void
}

function FlagDetailPanel({ flag, onClose, onDismissSuccess }: FlagDetailPanelProps) {
  const [showDismissModal, setShowDismissModal] = useState(false)

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        data-testid="flag-panel-backdrop"
      />
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl"
        data-testid="flag-detail-panel"
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <span
            className={`rounded px-2 py-1 text-xs font-bold uppercase ${SEVERITY_CLASSES[flag.severity] ?? 'bg-gray-100 text-gray-800'}`}
          >
            {flag.severity}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="flag-panel-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <p className="mb-4 text-sm text-gray-800">{flag.message}</p>
          {flag.status === 'dismissed' && (
            <div className="rounded bg-gray-50 p-3 text-xs text-gray-500">
              <span className="font-medium">Dismissed</span>
              {flag.dismissed_reason && (
                <p className="mt-1">{flag.dismissed_reason}</p>
              )}
            </div>
          )}
        </div>
        {flag.status === 'active' && (
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={() => setShowDismissModal(true)}
              className="w-full rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              data-testid="dismiss-flag-btn"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
      {showDismissModal && (
        <DismissModal
          flag={flag}
          onClose={() => setShowDismissModal(false)}
          onSuccess={() => {
            setShowDismissModal(false)
            onDismissSuccess()
            onClose()
          }}
        />
      )}
    </>
  )
}

function DismissModal({
  flag,
  onClose,
  onSuccess,
}: {
  flag: AuditFlag
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post(`/audit-flags/${flag.id}/dismiss/`, { reason })
    },
    onSuccess,
  })

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
      data-testid="dismiss-modal"
    >
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Dismiss Flag</h3>
        <p className="mb-3 text-sm text-gray-600">Optionally provide a reason for dismissal:</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="det-input mb-4 resize-none"
          rows={3}
          placeholder="Reason (optional)"
          data-testid="dismiss-reason-input"
        />
        {mutation.isError && (
          <p className="mb-3 text-sm text-red-600">Failed to dismiss flag. Please try again.</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            data-testid="dismiss-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            data-testid="dismiss-confirm-btn"
          >
            {mutation.isPending ? 'Dismissing…' : 'Confirm Dismiss'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: Photo[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const photo = photos[index]

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      data-testid="lightbox"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 text-white text-2xl font-bold"
        onClick={onClose}
        data-testid="lightbox-close"
        aria-label="Close"
      >
        ✕
      </button>
      {index > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-3xl font-bold"
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          data-testid="lightbox-prev"
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-3xl font-bold"
          onClick={(e) => { e.stopPropagation(); onNext() }}
          data-testid="lightbox-next"
          aria-label="Next"
        >
          ›
        </button>
      )}
      <img
        src={photo.public_url}
        alt={photo.space_name || photo.photo_type}
        className="max-h-[90vh] max-w-[90vw] rounded object-contain"
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
      />
    </div>
  )
}

function PhotoGrid({ versionId, roomId }: { versionId: string; roomId: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [panoramaPhoto, setPanoramaPhoto] = useState<Photo | null>(null)

  const { data: photos = [], isLoading } = useQuery<Photo[]>({
    queryKey: ['room-photos', versionId, roomId],
    queryFn: async () => {
      const res = await api.get<Photo[]>(
        `/audit-versions/${versionId}/rooms/${roomId}/photos/`,
      )
      return res.data
    },
  })

  const handleThumbClick = useCallback((photo: Photo, idx: number) => {
    if (photo.photo_type === 'panorama') {
      setPanoramaPhoto(photo)
    } else {
      setLightboxIndex(idx)
    }
  }, [])

  const handlePrev = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))
  }, [])

  const handleNext = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i))
  }, [photos.length])

  const handleClose = useCallback(() => setLightboxIndex(null), [])

  if (isLoading) return <div className="py-2 text-sm text-gray-500">Loading photos…</div>
  if (photos.length === 0) return <div className="py-2 text-sm text-gray-400" data-testid="no-photos">No photos.</div>

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" data-testid="photo-grid">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            className="overflow-hidden rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onClick={() => handleThumbClick(photo, idx)}
            data-testid={`photo-thumb-${photo.id}`}
          >
            <img
              src={photo.thumbnail_url || photo.public_url}
              alt={photo.space_name || photo.photo_type}
              className="h-24 w-full object-cover"
            />
          </button>
        ))}
      </div>
      {panoramaPhoto !== null && (
        <PanoramaViewer
          url={panoramaPhoto.public_url}
          alt={panoramaPhoto.space_name || panoramaPhoto.photo_type}
          onClose={() => setPanoramaPhoto(null)}
        />
      )}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </>
  )
}

const columnHelper = createColumnHelper<LogEntry>()

function makeColumns(
  flagsByEntry: Record<number, AuditFlag[]>,
  onFlagSelect: (flag: AuditFlag) => void,
) {
  return [
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
    columnHelper.display({
      id: 'audit_flags',
      header: 'Issues',
      cell: (info) => {
        const entryFlags = flagsByEntry[info.row.original.id] ?? []
        return <AuditFlagBadges flags={entryFlags} onSelect={onFlagSelect} />
      },
      enableSorting: false,
    }),
    columnHelper.accessor('notes', {
      header: 'Notes',
      cell: (info) => info.getValue() || '—',
      enableSorting: false,
    }),
  ]
}

function LogEntriesTable({ versionId, roomId }: { versionId: string; roomId: string }) {
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedFlag, setSelectedFlag] = useState<AuditFlag | null>(null)

  const { data: entries = [], isLoading, error } = useQuery<LogEntry[]>({
    queryKey: ['room-log-entries', versionId, roomId],
    queryFn: async () => {
      const res = await api.get<LogEntry[]>(
        `/audit-versions/${versionId}/rooms/${roomId}/log-entries/`,
      )
      return res.data
    },
  })

  const { data: auditFlags = [] } = useQuery<AuditFlag[]>({
    queryKey: ['room-audit-flags', versionId, roomId],
    queryFn: async () => {
      const res = await api.get<AuditFlag[]>(
        `/audit-versions/${versionId}/rooms/${roomId}/audit-flags/`,
      )
      return res.data
    },
  })

  const flagsByEntry: Record<number, AuditFlag[]> = {}
  for (const flag of auditFlags) {
    if (!flagsByEntry[flag.log_entry_id]) flagsByEntry[flag.log_entry_id] = []
    flagsByEntry[flag.log_entry_id].push(flag)
  }

  const handleDismissSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['room-audit-flags', versionId, roomId] })
  }, [queryClient, versionId, roomId])

  const columns = makeColumns(flagsByEntry, setSelectedFlag)

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
    <>
      <div data-testid="log-entries-table">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter entries…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="det-input max-w-xs"
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
      {selectedFlag !== null && (
        <FlagDetailPanel
          flag={selectedFlag}
          onClose={() => setSelectedFlag(null)}
          onDismissSuccess={handleDismissSuccess}
        />
      )}
    </>
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

  if (isLoading)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10 text-sm text-(--brand-ink-soft)"
        data-testid="room-page"
      >
        Loading room…
      </div>
    )
  if (error)
    return (
      <div
        className="flex flex-1 items-center justify-center p-10"
        data-testid="room-page"
      >
        <div className="det-card border-l-4 border-l-(--brand-ember) rounded-sm p-6 text-sm">
          Failed to load room.
        </div>
      </div>
    )
  if (!room) return null

  return (
    <div className="flex flex-1 flex-col" data-testid="room-page">
      <section className="shrink-0 border-b border-(--brand-rule) bg-(--brand-paper-soft)/40 px-10 pt-8 pb-5">
        <div className="det-label">Room</div>
        <h1 className="mt-2 font-display text-3xl font-medium leading-none tracking-tight text-(--brand-ink)">
          {room.name}
        </h1>
        <dl className="mt-5 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-4">
          {room.room_type && (
            <RoomFact label="Type" value={room.room_type} />
          )}
          {room.zone_label && (
            <RoomFact label="Zone" value={room.zone_label} mono />
          )}
          {room.pin_code && (
            <RoomFact label="Pin Code" value={room.pin_code} mono />
          )}
          {room.square_feet != null && (
            <RoomFact
              label="Square Feet"
              value={String(room.square_feet)}
              accent
            />
          )}
        </dl>
        {room.notes && (
          <div className="mt-4 max-w-3xl">
            <div className="det-label mb-1">Notes</div>
            <div className="det-card rounded-sm p-3 text-sm whitespace-pre-wrap text-(--brand-ink)">
              {room.notes}
            </div>
          </div>
        )}
      </section>

      <section className="min-h-0 flex-1 overflow-auto px-10 py-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight text-(--brand-ink)">
            Photos
          </h2>
        </div>
        <PhotoGrid versionId={versionId} roomId={roomId} />

        <div className="mt-10 mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight text-(--brand-ink)">
            Log Entries
          </h2>
        </div>
        <LogEntriesTable versionId={versionId} roomId={roomId} />
      </section>
    </div>
  )
}

function RoomFact({
  label,
  value,
  mono,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div>
      <div className="det-label">{label}</div>
      <div
        className={
          'mt-1 ' +
          (accent
            ? 'font-display text-2xl font-medium text-(--brand-ember)'
            : mono
              ? 'font-mono text-sm text-(--brand-ink)'
              : 'text-sm font-medium text-(--brand-ink)')
        }
      >
        {value}
      </div>
    </div>
  )
}
