import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeProvider';
import { useSidebar } from '@/contexts/SidebarContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import {
  PanelLeft,
  User,
  Moon,
  Sun,
  LogOut,
  ExternalLink,
  ChevronDown,
  Menu as MenuIcon,
} from 'lucide-react';

const PAGE_TITLES: Array<[string, string]> = [
  ['/admin/calendar', 'Calendrier'],
  ['/admin/service', 'Service en cours'],
  ['/admin/catalogue', 'Catalogue'],
  ['/admin/events', 'Événements'],
  ['/admin/closures', 'Fermetures'],
  ['/admin/users', 'Utilisateurs'],
  ['/admin/settings', 'Paramètres'],
  ['/admin/audit-logs', "Logs d'audit"],
  ['/admin/account', 'Mon compte'],
  ['/admin', 'Calendrier'],
];

function usePageTitle(): string {
  const { pathname } = useLocation();
  for (const [prefix, label] of PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return label;
  }
  return 'Admin';
}

export function Topbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toggle, setMobileOpen } = useSidebar();
  const navigate = useNavigate();
  const title = usePageTitle();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
      {/* Desktop: sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-8 w-8 text-muted-foreground sidebar:flex"
        onClick={toggle}
        aria-label="Masquer/afficher le menu"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {/* Mobile: hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground sidebar:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
      >
        <MenuIcon className="h-4 w-4" />
      </Button>

      {/* Page title */}
      <h1 className="hidden text-sm font-semibold text-foreground sidebar:block">{title}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search - hidden on small mobile */}
      <div className="hidden sm:flex">
        <GlobalSearch />
      </div>

      {/* Notification bell */}
      <NotificationBell />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="hidden max-w-28 truncate text-sm md:inline">
              {user?.username || user?.email}
            </span>
            <ChevronDown className="hidden h-3 w-3 text-muted-foreground md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div>
              <p className="text-sm font-medium">{user?.username || user?.email}</p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">{user?.role}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <NavLink to="/menu" target="_blank" className="cursor-pointer gap-2">
              <ExternalLink className="h-4 w-4" />
              Voir le menu public
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/admin/account" className="cursor-pointer gap-2">
              <User className="h-4 w-4" />
              Mon compte
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="gap-2"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
