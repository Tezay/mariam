import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Logo } from '@/components/Logo';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { ExternalLink, HelpCircle } from 'lucide-react';

export interface SidebarNavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
}

interface SidebarProps {
    navItems: SidebarNavItem[];
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
                    onClick={onClick}
                    className={({ isActive }) =>
                        cn(
                            'relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm select-none',
                            isCollapsed && 'justify-center px-2',
                            isActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                    }
                >
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                        {item.icon}
                    </span>
                    <motion.span
                        animate={{ opacity: isCollapsed ? 0 : 1 }}
                        transition={{ duration: 0.1 }}
                        className="flex-1 truncate whitespace-nowrap overflow-hidden"
                    >
                        {item.label}
                    </motion.span>
                    {!isCollapsed && item.badge && (
                        <span className="shrink-0">{item.badge}</span>
                    )}
                    {isCollapsed && item.badge && (
                        <span className="absolute top-1.5 right-1.5 scale-75 origin-top-right">
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

export function Sidebar({ navItems }: SidebarProps) {
    const { isCollapsed } = useSidebar();

    return (
        <motion.aside
            animate={{ width: isCollapsed ? 56 : 200 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="hidden sidebar:flex flex-col shrink-0 border-r border-border bg-card h-screen overflow-hidden"
        >
            <div className="h-14 relative border-b border-border shrink-0 overflow-hidden">
                <NavLink to="/admin" aria-label="Accueil" className="absolute inset-0">
                    <motion.img
                        src="/favicon.svg"
                        alt="Mariam"
                        animate={{ opacity: isCollapsed ? 1 : 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7"
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
                <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
                    {navItems.map((item) => (
                        <SidebarItem key={item.to} item={item} isCollapsed={isCollapsed} />
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-2 border-t border-border shrink-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                href="https://mariam.app/docs/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm"
                            >
                                <HelpCircle className="w-5 h-5 shrink-0" />
                                <motion.span
                                    animate={{ opacity: isCollapsed ? 0 : 1 }}
                                    transition={{ duration: 0.1 }}
                                    className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden"
                                >
                                    Aide
                                    <ExternalLink className="w-3 h-3 shrink-0" />
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
