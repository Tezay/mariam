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
    ['/admin/audit-logs', 'Logs d\'audit'],
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
        <header className="relative z-40 h-14 shrink-0 flex items-center gap-3 px-3 border-b border-border bg-card">
            {/* Desktop: sidebar toggle */}
            <Button
                variant="ghost"
                size="icon"
                className="hidden sidebar:flex h-8 w-8 text-muted-foreground"
                onClick={toggle}
                aria-label="Masquer/afficher le menu"
            >
                <PanelLeft className="w-4 h-4" />
            </Button>

            {/* Mobile: hamburger */}
            <Button
                variant="ghost"
                size="icon"
                className="sidebar:hidden h-8 w-8 text-muted-foreground"
                onClick={() => setMobileOpen(true)}
                aria-label="Ouvrir le menu"
            >
                <MenuIcon className="w-4 h-4" />
            </Button>

            {/* Page title */}
            <h1 className="text-sm font-semibold text-foreground hidden sidebar:block">
                {title}
            </h1>

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
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="hidden md:inline max-w-28 truncate text-sm">
                            {user?.username || user?.email}
                        </span>
                        <ChevronDown className="w-3 h-3 text-muted-foreground hidden md:block" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div>
                            <p className="font-medium text-sm">{user?.username || user?.email}</p>
                            <p className="text-xs text-muted-foreground capitalize mt-0.5">{user?.role}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <NavLink to="/menu" target="_blank" className="cursor-pointer gap-2">
                            <ExternalLink className="w-4 h-4" />
                            Voir le menu public
                        </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <NavLink to="/admin/account" className="cursor-pointer gap-2">
                            <User className="w-4 h-4" />
                            Mon compte
                        </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="gap-2"
                    >
                        {theme === 'dark'
                            ? <Sun className="w-4 h-4" />
                            : <Moon className="w-4 h-4" />
                        }
                        {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={handleLogout}
                        className="text-destructive focus:text-destructive gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Se déconnecter
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
