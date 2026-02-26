/**
 * MARIAM - Page de gestion des utilisateurs
 * 
 * Permet aux admins de :
 * - Voir la liste des utilisateurs
 * - Inviter de nouveaux utilisateurs
 * - Modifier les rôles
 * - Désactiver/réactiver des comptes
 * - Réinitialiser le MFA
 */
import { useState, useEffect } from 'react';
import { adminApi, User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    UserPlus,
    Shield,
    Edit3,
    Eye,
    Trash2,
    RefreshCw,
    Copy,
    Check,
    X,
    Link as LinkIcon
} from 'lucide-react';

interface Invitation {
    token: string;
    email: string;
    role: string;
    expires_at: string;
    is_used: boolean;
    is_valid: boolean;
}

const ROLE_LABELS: Record<string, { label: string; description: string; color: string }> = {
    admin: {
        label: 'Administrateur',
        description: 'Accès complet, gestion des utilisateurs',
        color: 'bg-red-500/10 text-red-600 dark:text-red-400'
    },
    editor: {
        label: 'Éditeur',
        description: 'Peut créer et modifier les menus',
        color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    },
    reader: {
        label: 'Lecteur',
        description: 'Consultation uniquement',
        color: 'bg-muted text-muted-foreground'
    },
};

export function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    // Charger les données
    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersData, invitationsData] = await Promise.all([
                adminApi.listUsers(),
                adminApi.listInvitations()
            ]);
            setUsers(usersData);
            // Filter active invitations (not used AND still valid)
            setInvitations(invitationsData.filter((inv: Invitation) => !inv.is_used && inv.is_valid));
        } catch (error) {
            console.error('Erreur chargement:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Copier le lien d'invitation
    const copyInviteLink = (token: string) => {
        const url = `${window.location.origin}/activate/${token}`;
        navigator.clipboard.writeText(url);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
    };


    const handleDeleteUser = async (user: User) => {
        if (!confirm(`Supprimer l'utilisateur ${user.email} ?`)) return;

        try {
            await adminApi.deleteUser(user.id);
            setUsers(users.filter(u => u.id !== user.id));
        } catch (error) {
            console.error('Erreur suppression:', error);
            alert('Erreur lors de la suppression');
        }
    };

    // Réinitialiser MFA
    const handleResetMfa = async (user: User) => {
        if (!confirm(`Réinitialiser le MFA de ${user.email} ? L'utilisateur devra reconfigurer son authentificateur.`)) return;

        try {
            const result = await adminApi.resetUserMfa(user.id);
            alert(`MFA réinitialisé. Nouveau lien d'activation envoyé.\nToken: ${result.activation_link.token}`);
            loadData();
        } catch (error) {
            console.error('Erreur reset MFA:', error);
            alert('Erreur lors de la réinitialisation');
        }
    };

    return (
        <div className="container-mariam py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Utilisateurs</h1>
                    <p className="text-muted-foreground">Gérez les accès à l'interface d'administration</p>
                </div>
                <Button onClick={() => setShowInviteModal(true)} className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Inviter
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Liste des utilisateurs */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Comptes actifs ({users.length})</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                {users.map((user) => (
                                    <div key={user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-muted/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-medium shrink-0">
                                                {(user.username || user.email).charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate">
                                                    {user.username || user.email}
                                                </p>
                                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 pl-13 sm:pl-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${ROLE_LABELS[user.role]?.color || 'bg-muted'}`}>
                                                    {ROLE_LABELS[user.role]?.label || user.role}
                                                </span>
                                                {!user.is_active && (
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                                        Inactif
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setEditingUser(user)}
                                                    title="Modifier"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleResetMfa(user)}
                                                    title="Réinitialiser MFA"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteUser(user)}
                                                    title="Supprimer"
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {users.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground">
                                        Aucun utilisateur
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Invitations en attente */}
                    {invitations.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <LinkIcon className="w-5 h-5" />
                                    Invitations en attente ({invitations.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border">
                                    {invitations.map((inv) => (
                                        <div key={inv.token} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4">
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate">{inv.email}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Expire le {new Date(inv.expires_at).toLocaleDateString('fr-FR')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_LABELS[inv.role]?.color || 'bg-muted'}`}>
                                                    {ROLE_LABELS[inv.role]?.label || inv.role}
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => copyInviteLink(inv.token)}
                                                    className="gap-2"
                                                >
                                                    {copiedToken === inv.token ? (
                                                        <>
                                                            <Check className="w-4 h-4 text-green-500" />
                                                            Copié
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-4 h-4" />
                                                            Copier le lien
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Modal d'invitation */}
            {showInviteModal && (
                <InviteModal
                    onClose={() => setShowInviteModal(false)}
                    onSuccess={() => {
                        setShowInviteModal(false);
                        loadData();
                    }}
                />
            )}

            {/* Modal d'édition */}
            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSuccess={() => {
                        setEditingUser(null);
                        loadData();
                    }}
                />
            )}
        </div>
    );
}

// Modal d'invitation
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'admin' | 'editor' | 'reader'>('editor');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ token: string } | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const invitation = await adminApi.createInvitation(email, role);
            setResult({ token: invitation.token });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erreur lors de la création');
        } finally {
            setIsLoading(false);
        }
    };

    const copyLink = () => {
        if (result) {
            navigator.clipboard.writeText(`${window.location.origin}/activate/${result.token}`);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Inviter un utilisateur</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {result ? (
                    <div className="space-y-4">
                        <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-4 rounded-lg">
                            <p className="font-medium">Invitation créée avec succès !</p>
                            <p className="text-sm mt-1">Partagez ce lien avec {email}</p>
                        </div>
                        <div className="bg-muted p-3 rounded-lg break-all text-sm text-foreground">
                            {window.location.origin}/activate/{result.token}
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={copyLink} className="flex-1 gap-2">
                                <Copy className="w-4 h-4" />
                                Copier le lien
                            </Button>
                            <Button variant="outline" onClick={onSuccess}>
                                Fermer
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="utilisateur@example.com"
                                required
                            />
                        </div>

                        <div>
                            <Label>Rôle</Label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                {Object.entries(ROLE_LABELS).map(([key, { label, description }]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setRole(key as 'admin' | 'editor' | 'reader')}
                                        className={`p-3 rounded-lg border text-left transition-all ${role === key
                                            ? 'border-primary ring-2 ring-primary/20'
                                            : 'border-border hover:border-muted-foreground'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {key === 'admin' && <Shield className="w-4 h-4 text-red-500" />}
                                            {key === 'editor' && <Edit3 className="w-4 h-4 text-blue-500" />}
                                            {key === 'reader' && <Eye className="w-4 h-4 text-muted-foreground" />}
                                            <span className="font-medium text-sm text-foreground">{label}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="text-destructive text-sm">{error}</div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <Button type="submit" disabled={isLoading} className="flex-1">
                                {isLoading ? 'Création...' : 'Créer l\'invitation'}
                            </Button>
                            <Button type="button" variant="outline" onClick={onClose}>
                                Annuler
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </>
    );
}

// Modal d'édition utilisateur
function EditUserModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
    const [role, setRole] = useState(user.role);
    const [isActive, setIsActive] = useState(user.is_active);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await adminApi.updateUser(user.id, { role, is_active: isActive });
            onSuccess();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erreur lors de la modification');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Modifier {user.username || user.email}</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label>Rôle</Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {Object.entries(ROLE_LABELS).map(([key, { label, color }]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setRole(key as 'admin' | 'editor' | 'reader')}
                                    className={`p-3 rounded-lg border text-center transition-all ${role === key
                                        ? 'border-primary ring-2 ring-primary/20'
                                        : 'border-border hover:border-muted-foreground'
                                        }`}
                                >
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
                                        {label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="w-4 h-4"
                        />
                        <Label htmlFor="isActive" className="cursor-pointer">Compte actif</Label>
                    </div>

                    {error && (
                        <div className="text-destructive text-sm">{error}</div>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Button type="submit" disabled={isLoading} className="flex-1">
                            {isLoading ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                    </div>
                </form>
            </div>
        </>
    );
}
