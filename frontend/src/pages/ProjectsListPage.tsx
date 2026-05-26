import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import api from '../lib/api'
import ProjectChatPanel from '../components/ProjectChatPanel'

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

export default function ProjectsListPage() {
  const navigate = useNavigate()
  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<Project[]>('/projects/')
      return res.data
    },
  })

  if (isLoading) return <div className="p-8">Loading projects…</div>
  if (error) return <div className="p-8 text-red-600">Failed to load projects.</div>

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-8">
      <h1 className="mb-6 text-2xl font-bold">Projects</h1>
      {projects && projects.length === 0 ? (
        <p className="text-gray-500">No projects found.</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-sm font-medium text-gray-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Client</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Buildings</th>
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => (
              <tr
                key={project.id}
                onClick={() => navigate({ to: '/projects/$projectId', params: { projectId: String(project.id) } })}
                className="cursor-pointer border-b hover:bg-gray-50"
                data-testid={`project-row-${project.id}`}
              >
                <td className="py-3 pr-4 font-medium">{project.name}</td>
                <td className="py-3 pr-4">{project.client || '—'}</td>
                <td className="py-3 pr-4">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize">{project.status.replace('_', ' ')}</span>
                </td>
                <td className="py-3 pr-4">{project.building_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
      <div className="w-96 shrink-0">
        <ProjectChatPanel projectId={null} />
      </div>
    </div>
  )
}
