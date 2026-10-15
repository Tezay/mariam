import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { getExistingSubscription, isPushSupported } from '@/lib/push';

export function NotificationBell() {
  const navigate = useNavigate();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;

    getExistingSubscription()
      .then((sub) => {
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        // The bell then shows as unsubscribed.
      });
  }, []);

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative rounded-full p-2 transition-colors hover:bg-white/10"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {isSubscribed && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-mariam-blue" />
      )}
    </button>
  );
}
