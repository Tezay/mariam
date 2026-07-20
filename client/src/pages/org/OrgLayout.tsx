/**
 * Dashboard shell for an organization director (org_admin): a cross-site view of
 * the organization (dashboard, sites, users, audit). Responsive: a sidebar on
 * desktop, a top bar with a horizontal nav on mobile. Distinct from the per-site
 * manager dashboard under /admin.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, Users, Shield, LogOut, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/org', label: 'Vue d’ensemble', icon: LayoutDashboard, end: true },
  { to: '/org/sites', label: 'Sites', icon: Building2 },
  { to: '/org/users', label: 'Utilisateurs', icon: Users },
  { to: '/org/audit', label: 'Audit', icon: Shield },
];

function NavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );
}

export function OrgLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Logo className="h-7 w-auto" />
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="mb-2 truncate px-1 text-xs text-muted-foreground">{user?.email}</p>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="md:hidden">
        <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <Logo className="h-7 w-auto" />
          <button onClick={logout} className="text-muted-foreground" aria-label="Déconnexion">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
