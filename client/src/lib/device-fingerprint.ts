/**
 * Browser signature, computed only when a vote is cast: collecting it on a plain
 * page view would make it tracking. The server salts it per organization and day
 * and keeps it in Redis for 48 hours only.
 */
import { getThumbmark } from '@thumbmarkjs/thumbmarkjs';

export async function deviceFingerprint(): Promise<string | null> {
  try {
    const result = await getThumbmark({
      // The library samples runs to its own servers unless this is off.
      logging: false,
      // Browsers randomise canvas, audio and WebGL readback; without these
      // presets the signature differs on every attempt and guards nothing.
      stabilize: ['private', 'iframe', 'vpn', 'always'],
      timeout: 3000,
      property_name_factory: (name: string) => `mariam-${name}`,
    });
    return result.thumbmark || null;
  } catch {
    return null;
  }
}
