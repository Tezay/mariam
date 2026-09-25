// BAN: the Base Adresse Nationale, queried through the IGN Géoplateforme.
export interface BanSuggestion {
  label: string;
  lat: number;
  lon: number;
}

export const banApi = {
  search: async (q: string): Promise<BanSuggestion[]> => {
    if (!q || q.length < 3) return [];
    const url = new URL('https://data.geopf.fr/geocodage/completion');
    url.searchParams.set('text', q);
    url.searchParams.set('maximumResponses', '6');
    url.searchParams.set('type', 'StreetAddress,PositionOfInterest');
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).map((r: { fulltext: string; x: number; y: number }) => ({
      label: r.fulltext,
      lat: r.y,
      lon: r.x,
    }));
  },
};
