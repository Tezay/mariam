/**
 * MARIAM - Audit Logs Page
 * 
 * Page sécurisée (admin) pour consulter les logs d'audit.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Download, ChevronLeft, ChevronRight, AlertTriangle, Search } from 'lucide-react';

interface AuditLog {
    id: number;
    user_id: number | null;
    user_email: string | null;
    action: string;
    target_type: string | null;
    target_id: number | null;
    details: any;
    ip_address: string | null;
    created_at: string;
}

interface AuditLogsResponse {
    logs: AuditLog[];
    total: number;
    page: number;
    per_page: number;
    pages: number;
}

// Action labels fr
const ACTION_LABELS: Record<string, string> = {
    'login': 'Connexion',
    'login_failed': 'Échec connexion',
    'logout': 'Déconnexion',
    'mfa_setup': 'Config. A2F',
    'user_create': 'Création utilisateur',
    'user_update': 'Modif. utilisateur',
    'user_delete': 'Suppr. utilisateur',
    'menu_create': 'Création menu',
    'menu_update': 'Modif. menu',
    'menu_publish': 'Publication menu',
    'event_create': 'Création événement',
    'event_update': 'Modif. événement',
    'event_delete': 'Suppr. événement',
    'activation_link_create': 'Création lien activation',
    'account_activate': 'Activation compte',
    'audit_logs_access': 'Accès logs',
    'audit_logs_export': 'Export logs',
    'settings_update': 'Modif. paramètres',
};

// Couleurs des badges par catégorie d'action
const getActionBadgeVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action.includes('delete') || action.includes('failed')) return 'destructive';
    if (action.includes('login') || action.includes('logout')) return 'outline';
    if (action.includes('create')) return 'default';
    return 'secondary';
};

export function AuditLogsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filtres
    const [actionFilter, setActionFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Charger logs
    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const response: AuditLogsResponse = await adminApi.getAuditLogs({
                page,
                per_page: 50,
                action: actionFilter || undefined
            });

            setLogs(response.logs);
            setTotal(response.total);
            setTotalPages(response.pages);
            setMfaRequired(false);
        } catch (error: any) {
            if (error.response?.data?.error === 'MFA_REQUIRED') {
                setMfaRequired(true);
            } else {
                console.error('Erreur chargement logs:', error);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/admin/menus');
            return;
        }
        loadLogs();
    }, [user, page, actionFilter]);

    // Export
    const handleExport = async () => {
        setIsExporting(true);
        try {
            await adminApi.exportAuditLogs({
                action: actionFilter || undefined
            });
        } catch (error) {
            console.error('Erreur export:', error);
        } finally {
            setIsExporting(false);
        }
    };

    // Filtre local par recherche
    const filteredLogs = logs.filter(log =>
        !searchTerm ||
        log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Ecran de MFA requis
    if (mfaRequired) {
        return (
            <div className="container-mariam py-12 max-w-2xl">
                <Card className="border-amber-200 bg-amber-50">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <Shield className="w-8 h-8 text-amber-600" />
                            <div>
                                <CardTitle className="text-amber-900">Authentification à deux facteurs requise</CardTitle>
                                <CardDescription className="text-amber-700">
                                    L'accès aux logs d'audit nécessite l'activation de l'A2F pour des raisons de sécurité.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-amber-800 mb-4">
                            Les logs d'audit contiennent des informations sensibles (adresses IP, actions utilisateurs, etc.).
                            Pour y accéder, vous devez d'abord activer l'authentification à deux facteurs sur votre compte.
                        </p>
                        <Button onClick={() => navigate('/admin/users')} className="gap-2">
                            <Shield className="w-4 h-4" />
                            Configurer l'A2F
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container-mariam py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-6 h-6 text-mariam-blue" />
                        <h1 className="text-2xl font-bold text-gray-900">Logs d'audit</h1>
                    </div>
                    <p className="text-gray-600">
                        Historique des actions sensibles et événements de sécurité
                    </p>
                </div>

                <Button
                    onClick={handleExport}
                    disabled={isExporting}
                    variant="outline"
                    className="gap-2"
                >
                    <Download className="w-4 h-4" />
                    {isExporting ? 'Export...' : 'Exporter CSV'}
                </Button>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <Label htmlFor="search">Rechercher</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    id="search"
                                    placeholder="Email, action, IP..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <div className="md:w-64">
                            <Label htmlFor="action-filter">Filtrer par action</Label>
                            <select
                                id="action-filter"
                                value={actionFilter}
                                onChange={(e) => {
                                    setActionFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                            >
                                <option value="">Toutes les actions</option>
                                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-mariam-blue"></div>
                </div>
            ) : logs.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-gray-500">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Aucun log trouvé</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Date</TableHead>
                                    <TableHead>Utilisateur</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Cible</TableHead>
                                    <TableHead>IP</TableHead>
                                    <TableHead className="w-[100px]">Détails</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-sm text-gray-500">
                                            {new Date(log.created_at).toLocaleString('fr-FR', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {log.user_email || <span className="text-gray-400 italic">Système</span>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getActionBadgeVariant(log.action)}>
                                                {ACTION_LABELS[log.action] || log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-gray-600">
                                            {log.target_type ? (
                                                <span>{log.target_type}:{log.target_id}</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm font-mono text-gray-600">
                                            {log.ip_address || <span className="text-gray-400">—</span>}
                                        </TableCell>
                                        <TableCell>
                                            {log.details && (
                                                <button
                                                    className="text-xs text-mariam-blue hover:underline"
                                                    onClick={() => alert(JSON.stringify(log.details, null, 2))}
                                                >
                                                    Voir
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-6">
                        <p className="text-sm text-gray-600">
                            {total} log{total > 1 ? 's' : ''} au total
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="gap-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> Précédent
                            </Button>
                            <span className="text-sm text-gray-600">
                                Page {page} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="gap-1"
                            >
                                Suivant <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
