/**
 * Shell shared by every authenticated dashboard (site admin, org director).
 *
 * Navigation, breakpoints and mobile behaviour live here once so the two
 * dashboards cannot drift apart; callers only supply their nav and options.
 */
import { Suspense, type ReactNode } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import {
  Sidebar,
  TenantChip,
  type SidebarNavItem,
  type SidebarTenant,
} from '@/components/layout/Sidebar';
import { Topbar, type PageTitleMap } from '@/components/layout/Topbar';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DashboardShellProps {
  navItems: SidebarNavItem[];
  homePath: string;
  /** Omit to hide the floating mobile nav entirely. */
  bottomNavPaths?: string[];
  pageTitles: PageTitleMap;
  fallbackTitle: string;
  showSearch?: boolean;
  showNotifications?: boolean;
  accountPath: string;
  tenant?: SidebarTenant;
  /** Rendered between the top bar and the page. */
  banner?: ReactNode;
  /** Omit so a page can manage its own padding. */
  contentClassName?: string;
}

function ContentSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function MobileDrawer({
  navItems,
  tenant,
  isOpen,
  onClose,
}: {
  navItems: SidebarNavItem[];
  tenant?: SidebarTenant;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 sidebar:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card sidebar:hidden"
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
              <Logo className="h-8 w-auto" />
              <button
                onClick={onClose}
                className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {tenant && (
              <div className="shrink-0 px-3 pt-3">
                <TenantChip tenant={tenant} />
              </div>
            )}

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge}
                </NavLink>
              ))}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function MobileBottomNav({ items }: { items: SidebarNavItem[] }) {
  return (
    <motion.nav
      className="fixed bottom-4 left-1/2 z-30 flex items-center gap-0.5 rounded-full border border-border/40 bg-background/70 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 sidebar:hidden"
      // framer-motion drives the transform, so the -translate-x-1/2 centering
      // has to go through `x` or a Tailwind class would be overwritten.
      initial={{ opacity: 0, y: 12, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 12, x: '-50%' }}
      transition={{ duration: 0.2 }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              // Fixed width: every destination gets the same target, whatever
              // the label length.
              'flex w-[72px] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] leading-tight transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )
          }
        >
          <span className="relative">
            {item.icon}
            {item.badge && <span className="absolute -right-0.5 -top-0.5">{item.badge}</span>}
          </span>
          <span className="w-full truncate text-center">{item.shortLabel ?? item.label}</span>
        </NavLink>
      ))}
    </motion.nav>
  );
}

function DashboardShellContent({
  navItems,
  homePath,
  bottomNavPaths,
  pageTitles,
  fallbackTitle,
  showSearch,
  showNotifications,
  accountPath,
  tenant,
  banner,
  contentClassName,
}: DashboardShellProps) {
  const { isMobileOpen, setMobileOpen, immersive } = useSidebar();

  const bottomNavItems = bottomNavPaths
    ? navItems.filter((item) => bottomNavPaths.includes(item.to))
    : [];

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar navItems={navItems} homePath={homePath} tenant={tenant} />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            pageTitles={pageTitles}
            fallbackTitle={fallbackTitle}
            showSearch={showSearch}
            showNotifications={showNotifications}
            accountPath={accountPath}
          />
          {banner}
          <main
            className={cn(
              'flex-1 overflow-auto',
              immersive || !bottomNavItems.length ? 'pb-0' : 'pb-24 sidebar:pb-0'
            )}
          >
            <Suspense fallback={<ContentSkeleton />}>
              {contentClassName ? (
                <div className={contentClassName}>
                  <Outlet />
                </div>
              ) : (
                <Outlet />
              )}
            </Suspense>
          </main>
        </div>
      </div>

      <MobileDrawer
        navItems={navItems}
        tenant={tenant}
        isOpen={isMobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <AnimatePresence>
        {!immersive && bottomNavItems.length > 0 && <MobileBottomNav items={bottomNavItems} />}
      </AnimatePresence>
    </>
  );
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <SidebarProvider>
      <DashboardShellContent {...props} />
    </SidebarProvider>
  );
}
