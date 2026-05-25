import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import api from '../lib/api'

interface Project {
  id: number
  name: string
  client: string
  project_type: string
  status: string
  building_count: number
  created: string
  modified: string
}

interface Building {
  id: number
  name: string
  address: string
  building_type: string
  square_feet: number | null
  created: string
  modified: string
}

interface AuditVersion {
  id: number
  version_number: number
  label: string
  status: string
  created_by_name: string
  is_current: boolean
  created: string
  modified: string
}

const columnHelper = createColumnHelper<AuditVersion>()

const columns = [
  columnHelper.accessor('version_number', { header: '#', size: 60 }),
  columnHelper.accessor('label', { header: 'Label' }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize">
        {info.getValue().replace(/_/g, ' ')}
      </span>
    ),
  }),
  columnHelper.accessor('created_by_name', { header: 'Created By' }),
  columnHelper.accessor('created', {
    header: 'Created',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
]

function BuildingVersionsTable({ buildingId }: { buildingId: number }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: versions, isLoading } = useQuery<AuditVersion[]>({
    queryKey: ['building-versions', buildingId],
    queryFn: async () => {
      const res = await api.get<AuditVersion[]>(`/buildings/${buildingId}/audit-versions/`)
      return res.data
    },
  })

  const table = useReactTable({
    data: versions ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) return <div className="py-2 pl-8 text-sm text-gray-400">Loading versions…</div>

  if (!versions || versions.length === 0) {
    return <div className="py-2 pl-8 text-sm text-gray-400">No audit versions.</div>
  }

  return (
    <table className="ml-8 w-full border-collapse text-left text-sm" data-testid={`versions-table-${buildingId}`}>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b text-xs font-medium text-gray-500">
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="cursor-pointer py-1 pr-4"
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="py-1 pr-4">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set())

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get<Project>(`/projects/${projectId}/`)
      return res.data
    },
  })

  const { data: buildings, isLoading: buildingsLoading } = useQuery<Building[]>({
    queryKey: ['project-buildings', projectId],
    queryFn: async () => {
      const res = await api.get<Building[]>(`/projects/${projectId}/buildings/`)
      return res.data
    },
  })

  const toggleBuilding = (id: number) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (projectLoading) return <div className="p-8">Loading project…</div>
  if (projectError) return <div className="p-8 text-red-600">Failed to load project.</div>
  if (!project) return null

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold">{project.name}</h1>
      <div className="mb-6 text-sm text-gray-500">
        {project.client && <span className="mr-4">Client: {project.client}</span>}
        <span className="mr-4">Type: <span className="capitalize">{project.project_type}</span></span>
        <span>Status: <span className="capitalize">{project.status.replace(/_/g, ' ')}</span></span>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Buildings</h2>

      {buildingsLoading ? (
        <div className="text-gray-400">Loading buildings…</div>
      ) : !buildings || buildings.length === 0 ? (
        <p className="text-gray-500">No buildings found.</p>
      ) : (
        <div className="space-y-2">
          {buildings.map((building) => (
            <div key={building.id} className="rounded border">
              <button
                onClick={() => toggleBuilding(building.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                data-testid={`building-row-${building.id}`}
              >
                <div>
                  <span className="font-medium">{building.name}</span>
                  {building.address && <span className="ml-3 text-sm text-gray-400">{building.address}</span>}
                </div>
                <span className="text-gray-400">{expandedBuildings.has(building.id) ? '▼' : '▶'}</span>
              </button>
              {expandedBuildings.has(building.id) && (
                <div className="border-t px-4 py-2">
                  <BuildingVersionsTable buildingId={building.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
