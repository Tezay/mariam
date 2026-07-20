import { useEffect } from 'react';

/**
 * Keeps the document title and meta description in sync during SPA navigation.
 *
 * The server-rendered shell injects per-restaurant meta for the first paint and
 * for crawlers/Open Graph scrapers; this hook covers client-side route changes
 * within the public app, where the server shell no longer runs.
 */
export function useDocumentMeta({ title, description }: { title?: string; description?: string }) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  useEffect(() => {
    if (!description) return;
    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [description]);
}
