interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Window {
  /** Set by /install-prompt.js. */
  __installPrompt?: BeforeInstallPromptEvent | null;
  /** Set by /config.js, which the server writes from its environment. */
  __RUNTIME_CONFIG__?: {
    API_URL?: string;
    APP_VERSION?: string;
    CANONICAL_HOST?: string;
    UMAMI_SCRIPT_URL?: string;
    UMAMI_WEBSITE_ID?: string;
    SENTRY_DSN?: string;
    SENTRY_ENVIRONMENT?: string;
  };
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void;
    identify: (data: Record<string, unknown>) => void;
  };
}
