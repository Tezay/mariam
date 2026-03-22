/**
 * MARIAM — Onboarding installation PWA (admin/editor)
 *
 * Affiché une seule fois après le premier login pour les utilisateurs
 * admin ou éditeur. Guide l'utilisateur pour installer l'application
 * sur son appareil, avec des instructions adaptées à chaque plateforme.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { authApi } from '@/lib/api';
import { detectPlatform } from '@/lib/push';
import { usePwaInstall } from '@/contexts/PwaInstallContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import {
    Smartphone,
    Monitor,
    RefreshCw,
    CheckCircle,
    Copy,
    Check,
    ArrowRight,
    Share,
    Ellipsis,
    SquarePlus,
} from 'lucide-react';

const INSTALL_DONE_KEY = 'mariam_pwa_install_done';

function markDone() {
    localStorage.setItem(INSTALL_DONE_KEY, '1');
}

// ─── Shared "skip" button ─────────────────────────────────────────────────────
function SkipButton({ label, onClick }: { label?: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
            {label ?? 'Installer plus tard'}
            <ArrowRight className="w-3.5 h-3.5" />
        </button>
    );
}

// ─── Shared icon header ───────────────────────────────────────────────────────
function IconHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>
    );
}

// ─── iOS branch ──────────────────────────────────────────────────────────────
function IosInstructions({ isSafari, onDone }: { isSafari: boolean; onDone: () => void }) {
    return (
        <div className="bg-card border border-border shadow-lg rounded-lg p-8 w-full max-w-2xl space-y-6">
            <IconHeader
                title="Installez Mariam — Gestion"
                subtitle="Accédez au tableau de bord directement depuis votre écran d'accueil."
            />

            <div className="flex flex-col gap-3">
                {isSafari ? (
                    <>
                        <Step number={1} text={<span className="inline-flex items-center gap-1 flex-wrap">Appuyez sur <Ellipsis className="inline w-4 h-4 shrink-0" /> à droite de la barre d'adresse</span>} />
                        <Step number={2} text={<span className="inline-flex items-center gap-1 flex-wrap">Appuyez sur <Share className="inline w-4 h-4 shrink-0" /> <strong>Partager</strong></span>} />
                        <Step number={3} text={<span className="inline-flex items-center gap-1 flex-wrap">Sélectionnez <SquarePlus className="inline w-4 h-4 shrink-0" /> <strong>Sur l'écran d'accueil</strong></span>} />
                    </>
                ) : (
                    <>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
                            Pour installer l'application, ouvrez cette page dans <strong>Safari</strong>.
                        </div>
                        <Step number={1} text={<span className="inline-flex items-center gap-1 flex-wrap">Appuyez sur <Share className="inline w-4 h-4 shrink-0" /> dans votre navigateur</span>} />
                        <Step number={2} text={<span className="inline-flex items-center gap-1 flex-wrap">Sélectionnez <SquarePlus className="inline w-4 h-4 shrink-0" /> <strong>Sur l'écran d'accueil</strong></span>} />
                    </>
                )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground text-center">
                iOS vous demandera de vous reconnecter au premier lancement depuis l'écran d'accueil.
            </div>

            <div className="flex flex-col items-center gap-3">
                <Button className="w-full gap-2" onClick={onDone}>
                    <CheckCircle className="w-4 h-4" />
                    J'ai installé l'application
                </Button>
                <SkipButton onClick={onDone} />
            </div>
        </div>
    );
}

// ─── Android branch ───────────────────────────────────────────────────────────
function AndroidInstructions({ onDone }: { onDone: () => void }) {
    const { installPrompt, triggerInstall } = usePwaInstall();
    const [installing, setInstalling] = useState(false);

    const handleInstall = async () => {
        setInstalling(true);
        const outcome = await triggerInstall();
        setInstalling(false);
        if (outcome === 'accepted') onDone();
    };

    return (
        <div className="bg-card border border-border shadow-lg rounded-lg p-8 w-full max-w-sm space-y-6">
            <IconHeader
                title="Installez Mariam — Gestion"
                subtitle="Accédez au tableau de bord directement depuis votre écran d'accueil."
            />

            <div className="flex flex-col gap-3">
                <Step number={1} text={<>Appuyez sur le bouton ci-dessous</>} />
                <Step number={2} text={<>Confirmez en appuyant sur <strong>« Installer »</strong></>} />
                <Step number={3} text={<>Lancez <strong>Mariam — Gestion</strong> depuis votre écran d'accueil</>} />
            </div>

            <div className="flex flex-col items-center gap-3">
                {installPrompt ? (
                    <Button className="w-full gap-2" onClick={handleInstall} disabled={installing}>
                        <Smartphone className="w-4 h-4" />
                        {installing ? 'Installation...' : 'Installer maintenant'}
                    </Button>
                ) : (
                    <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground text-center w-full">
                        Le navigateur n'a pas encore proposé l'installation.
                        Réessayez dans quelques instants ou installez via le menu du navigateur.
                    </div>
                )}
                <SkipButton onClick={onDone} />
            </div>
        </div>
    );
}

// ─── Desktop branch ───────────────────────────────────────────────────────────
function DesktopInstructions({ onDone }: { onDone: () => void }) {
    const { installPrompt, triggerInstall } = usePwaInstall();
    const [transferToken, setTransferToken] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number>(0);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const generateToken = useCallback(async () => {
        setIsGenerating(true);
        try {
            const { transfer_token, expires_in } = await authApi.generateSessionTransfer();
            setTransferToken(transfer_token);
            setExpiresAt(Date.now() + expires_in * 1000);
            setSecondsLeft(expires_in);
        } catch {
            // silently fail — user can retry
        } finally {
            setIsGenerating(false);
        }
    }, []);

    useEffect(() => { generateToken(); }, [generateToken]);

    // Countdown
    useEffect(() => {
        if (!expiresAt) return;
        const interval = setInterval(() => {
            const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
            setSecondsLeft(left);
            if (left === 0) clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    const qrUrl = transferToken
        ? `${window.location.origin}/admin/setup?transfer_token=${transferToken}`
        : null;

    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const ss = String(secondsLeft % 60).padStart(2, '0');
    const expired = secondsLeft === 0 && transferToken !== null;

    const handleCopy = async () => {
        if (!qrUrl) return;
        await navigator.clipboard.writeText(qrUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDesktopInstall = async () => {
        await triggerInstall();
        onDone();
    };

    return (
        <div className="bg-card border border-border shadow-lg rounded-lg p-8 w-full max-w-2xl space-y-6">
            <IconHeader
                title="Installez Mariam sur votre téléphone 🚀"
                subtitle="Scannez ce QR code avec votre téléphone pour avoir accès à Mariam de n'importe où !"
            />

            {/* QR code */}
            <div className="flex flex-col items-center gap-3">
                <div className="relative rounded-xl border-2 border-primary/20 p-4 bg-white">
                    {isGenerating || !qrUrl ? (
                        <div className="flex items-center justify-center w-48 h-48">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : (
                        <QRCodeSVG
                            value={qrUrl}
                            size={192}
                            bgColor="#ffffff"
                            fgColor="#001BB7"
                            level="M"
                        />
                    )}
                    {expired && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/90 gap-2">
                            <p className="text-sm font-medium">Code expiré</p>
                            <Button size="sm" variant="outline" onClick={generateToken} className="gap-1">
                                <RefreshCw className="w-3 h-3" /> Régénérer
                            </Button>
                        </div>
                    )}
                </div>

                {!expired && transferToken && (
                    <p className="text-xs text-muted-foreground">
                        Expire dans <span className="font-mono font-medium">{mm}:{ss}</span>
                    </p>
                )}

                {qrUrl && !expired && (
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Lien copié !' : 'Copier le lien'}
                    </button>
                )}
            </div>

            {/* Instructions */}
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-xs font-medium text-foreground/70 uppercase tracking-wide mb-1">Comment ça marche</p>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">1</span>
                    <span>Ouvrez l'appareil photo de votre téléphone et pointez-le vers ce code</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">2</span>
                    <span>Vous serez connecté automatiquement et guidé pour installer l'application</span>
                </div>
            </div>

            <div className="flex flex-col items-center gap-3 border-t pt-4">
                {installPrompt && (
                    <Button variant="outline" className="w-full gap-2" onClick={handleDesktopInstall}>
                        <Monitor className="w-4 h-4" />
                        Installer sur cet ordinateur
                    </Button>
                )}
                <SkipButton label="Continuer sans installer" onClick={onDone} />
            </div>
        </div>
    );
}

// ─── Step component ───────────────────────────────────────────────────────────
function Step({ number, text }: { number: number; text: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {number}
            </span>
            <p className="text-sm leading-relaxed">{text}</p>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function InstallPage() {
    const navigate = useNavigate();
    const platform = detectPlatform();
    const ua = navigator.userAgent;
    const isIosSafari = platform === 'ios' && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);

    const handleDone = () => {
        markDone();
        navigate('/admin/menus', { replace: true });
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-8">
            <Logo className="h-20 w-auto" />

            {platform === 'ios' && (
                <IosInstructions isSafari={isIosSafari} onDone={handleDone} />
            )}
            {platform === 'android' && (
                <AndroidInstructions onDone={handleDone} />
            )}
            {platform === 'desktop' && (
                <DesktopInstructions onDone={handleDone} />
            )}
        </div>
    );
}
