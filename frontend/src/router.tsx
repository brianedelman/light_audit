import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import LoginPage from './pages/LoginPage'
import PasswordResetPage from './pages/PasswordResetPage'
import PasswordResetConfirmPage from './pages/PasswordResetConfirmPage'
import ProjectsListPage from './pages/ProjectsListPage'
import ProjectDetailPage from './pages/ProjectDetailPage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>Home</div>,
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  passwordResetRoute,
  passwordResetConfirmRoute,
  projectsRoute,
  projectDetailRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
