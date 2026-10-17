import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { components } from './schema.gen';

type Device = components['schemas']['Device'];

export const devicesApi = {
  create: async (): Promise<string> => {
    const response = await publicAxios.post('/devices', {}, { timeout: PUBLIC_API_TIMEOUT_MS });
    return (response.data as Device).device_id;
  },
};
