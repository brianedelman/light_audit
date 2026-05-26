import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import api from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import FloorTreeSidebar from '../components/FloorTreeSidebar'
import ChatPanel from '../components/ChatPanel'

interface AuditVersion {
  id: number
  version_number: number
  label: string
  status: string
  is_current: boolean
  created_by_name: string
  created: string
  modified: string
}

export default function AuditVersionPage() {
  const { versionId } = useParams({ from: '/audit-versions/$versionId' })

  const { data: version, isLoading, error } = useQuery<AuditVersion>({
    queryKey: ['audit-version', versionId],
    queryFn: async () => {
      const res = await api.get<AuditVersion>(`/audit-versions/${versionId}/`)
      return res.data
    },
  })

  if (isLoading) return <div className="p-8">Loading version…</div>
  if (error) return <div className="p-8 text-red-600">Failed to load version.</div>
  if (!version) return null

  return (
    <div className="flex h-full" data-testid="audit-version-page">
      <FloorTreeSidebar versionId={versionId} />
      <div className="flex-1 p-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Version {version.version_number}</h1>
          <ExportButtons versionId={versionId} />
        </div>
        <dl className="space-y-2 text-sm">
          {version.label && (
            <div>
              <dt className="inline font-medium text-gray-500">Label: </dt>
              <dd className="inline">{version.label}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-gray-500">Status: </dt>
            <dd className="inline capitalize">{version.status.replace(/_/g, ' ')}</dd>
          </div>
          {version.created_by_name && (
            <div>
              <dt className="inline font-medium text-gray-500">Created by: </dt>
              <dd className="inline">{version.created_by_name}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-gray-500">Created: </dt>
            <dd className="inline">{new Date(version.created).toLocaleDateString()}</dd>
          </div>
          {version.is_current && (
            <div>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Current</span>
            </div>
          )}
        </dl>
      </div>
      <div className="w-96 shrink-0">
        <ChatPanel versionId={versionId} />
      </div>
    </div>
  )
}
