import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';

export const weeklyEmailsApi = {
  unsubscribe: async (token: string): Promise<void> => {
    await publicAxios.post(`/weekly-emails/${encodeURIComponent(token)}/unsubscribe`, undefined, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
  },
};
