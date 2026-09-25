import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';

export interface MenuVote {
  rating: 1 | 2 | 3;
  dish_ids: number[];
  restaurant_id: number;
  updated_at: string | null;
}

export interface VoteDishChoice {
  id: number;
  name: string;
  image_url: string | null;
}

export interface VoteDishGroup {
  category_id: number;
  label: string;
  dishes: VoteDishChoice[];
}

export interface VoteState {
  vote: MenuVote | null;
  dish_groups: VoteDishGroup[];
  voting_open: boolean;
  icon_preset: string;
}

export const voteApi = {
  mint: async (): Promise<string | null> => {
    const response = await publicAxios.post(
      '/public/device',
      {},
      { timeout: PUBLIC_API_TIMEOUT_MS }
    );
    return (response.data?.device_id as string | undefined) ?? null;
  },
  getState: async (siteSlug: string, deviceId: string): Promise<VoteState> => {
    const response = await publicAxios.get(`/public/${siteSlug}/vote`, {
      params: { device_id: deviceId },
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data as VoteState;
  },
  cast: async (
    siteSlug: string,
    body: {
      device_id: string;
      rating: number;
      dish_ids?: number[];
      fingerprint?: string | null;
    }
  ): Promise<{ status: string; vote: MenuVote | null }> => {
    const response = await publicAxios.post(`/public/${siteSlug}/vote`, body, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data as { status: string; vote: MenuVote | null };
  },
};
