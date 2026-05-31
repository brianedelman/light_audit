import { createRouter, createRoute, createRootRoute, Outlet, redirect } from '@tanstack/react-router'
import api from './lib/api'
import LoginPage from './pages/LoginPage'
import PasswordResetPage from './pages/PasswordResetPage'
import PasswordResetConfirmPage from './pages/PasswordResetConfirmPage'
import ProjectsListPage from './pages/ProjectsListPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import AuditVersionLayout from './pages/AuditVersionLayout'
import AuditVersionPage from './pages/AuditVersionPage'
import AuditVersionFloorPage from './pages/AuditVersionFloorPage'
import AuditVersionRoomPage from './pages/AuditVersionRoomPage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    let authed = false
    try {
      await api.get('/auth/me/', { skipAuthRedirect: true } as never)
      authed = true
    } catch {
      authed = false
    }
    throw redirect({ to: authed ? '/projects' : '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/password-reset',
  component: PasswordResetPage,
})

const passwordResetConfirmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/password-reset/confirm/$token',
  component: PasswordResetConfirmPage,
})

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsListPage,
})

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
})

const auditVersionLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-versions/$versionId',
  component: AuditVersionLayout,
})

const auditVersionIndexRoute = createRoute({
  getParentRoute: () => auditVersionLayoutRoute,
  path: '/',
  component: AuditVersionPage,
})

const auditVersionFloorRoute = createRoute({
  getParentRoute: () => auditVersionLayoutRoute,
  path: 'floors/$floorId',
  component: AuditVersionFloorPage,
})

const auditVersionRoomRoute = createRoute({
  getParentRoute: () => auditVersionLayoutRoute,
  path: 'rooms/$roomId',
  component: AuditVersionRoomPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  passwordResetRoute,
  passwordResetConfirmRoute,
  projectsRoute,
  projectDetailRoute,
  auditVersionLayoutRoute.addChildren([
    auditVersionIndexRoute,
    auditVersionFloorRoute,
    auditVersionRoomRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
