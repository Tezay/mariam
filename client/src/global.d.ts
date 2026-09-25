interface Window {
  /** Set by /config.js, which the container entrypoint rewrites at start. */
  __RUNTIME_CONFIG__?: {
    API_URL?: string;
    APP_VERSION?: string;
    CANONICAL_HOST?: string;
    UMAMI_WEBSITE_ID?: string;
    SENTRY_DSN?: string;
    SENTRY_ENVIRONMENT?: string;
  };
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void;
    identify: (data: Record<string, unknown>) => void;
  };
}
