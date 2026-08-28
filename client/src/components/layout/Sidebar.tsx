import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Logo } from '@/components/Logo';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { ExternalLink, HelpCircle } from 'lucide-react';

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  end?: boolean;
  /** Shorter label for the floating mobile nav, where width is tight. */
  shortLabel?: string;
}

export interface SidebarTenant {
  /** Overline above the name, e.g. "Site" or "Organisation". */
  label: string;
  name: string;
}

interface SidebarProps {
  navItems: SidebarNavItem[];
  homePath?: string;
  tenant?: SidebarTenant;
}

export function TenantChip({ tenant }: { tenant: SidebarTenant }) {
  return (
    <div className="rounded-[10px] bg-muted px-2.5 py-2" title={tenant.name}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {tenant.label}
      </p>
      <p className="truncate text-sm font-semibold text-foreground">{tenant.name}</p>
    </div>
  );
}

function CollapsedTenantChip({ tenant }: { tenant: SidebarTenant }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-[10px] bg-muted text-xs font-semibold text-foreground">
          {tenant.name.charAt(0).toUpperCase()}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {tenant.label} · {tenant.name}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarItem({
  item,
  isCollapsed,
  onClick,
}: {
  item: SidebarNavItem;
  isCollapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onClick}
          className={({ isActive }) =>
            cn(
              'relative flex select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              isCollapsed && 'justify-center px-2',
              isActive
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )
          }
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
          <motion.span
            animate={{ opacity: isCollapsed ? 0 : 1 }}
            transition={{ duration: 0.1 }}
            className="flex-1 overflow-hidden truncate whitespace-nowrap"
          >
            {item.label}
          </motion.span>
          {!isCollapsed && item.badge && <span className="shrink-0">{item.badge}</span>}
          {isCollapsed && item.badge && (
            <span className="absolute right-1.5 top-1.5 origin-top-right scale-75">
              {item.badge}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

export function Sidebar({ navItems, homePath = '/admin', tenant }: SidebarProps) {
  const { isCollapsed } = useSidebar();

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 56 : 200 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card sidebar:flex"
    >
      <div className="relative h-14 shrink-0 overflow-hidden border-b border-border">
        <NavLink to={homePath} aria-label="Accueil" className="absolute inset-0">
          <motion.img
            src="/favicon.svg"
            alt="Mariam"
            animate={{ opacity: isCollapsed ? 1 : 0 }}
            transition={{ duration: 0.15 }}
            className="absolute left-3 top-1/2 h-7 w-7 -translate-y-1/2"
          />
          {/* Déplié : grand logo centré dans toute la largeur du header */}
          <motion.div
            animate={{ opacity: isCollapsed ? 0 : 1 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Logo className="h-8 w-auto" />
          </motion.div>
        </NavLink>
      </div>

      {/* Nav */}
      <TooltipProvider delayDuration={300}>
        {tenant && (
          <div className={cn('shrink-0 px-2 pt-2', isCollapsed && 'px-1')}>
            {isCollapsed ? <CollapsedTenantChip tenant={tenant} /> : <TenantChip tenant={tenant} />}
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-2">
          {navItems.map((item) => (
            <SidebarItem key={item.to} item={item} isCollapsed={isCollapsed} />
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="https://mariam.app/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HelpCircle className="h-5 w-5 shrink-0" />
                <motion.span
                  animate={{ opacity: isCollapsed ? 0 : 1 }}
                  transition={{ duration: 0.1 }}
                  className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap"
                >
                  Aide
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </motion.span>
              </a>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Aide
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </TooltipProvider>
    </motion.aside>
  );
}
