/**
 * MARIAM — Bouton cloche de notifications.
 *
 * Affiché en haut à droite de l'interface /menu (mobile).
 * - Si souscrit  : cloche pleine (avec indicateur)
 * - Si non souscrit : cloche vide
 * - Clic -> navigation vers /notifications
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { getExistingSubscription, isPushSupported } from '@/lib/push';


export function NotificationBell() {
    const navigate = useNavigate();
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if (!isPushSupported()) return;

        getExistingSubscription().then((sub) => {
            setIsSubscribed(!!sub);
        }).catch(() => {
            // Silencieux
        });
    }, []);

    return (
        <button
            onClick={() => navigate('/notifications')}
            className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Notifications"
        >
            <Bell className="h-5 w-5" />
            {isSubscribed && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-mariam-blue" />
            )}
        </button>
    );
}
