import type { MetaDescriptor } from 'react-router';

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  siteName: string;
  image?: string | null;
}

export function pageMeta({ title, description, url, siteName, image }: PageMeta): MetaDescriptor[] {
  const tags: MetaDescriptor[] = [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: url },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: siteName },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
  if (image) {
    tags.push({ property: 'og:image', content: image }, { name: 'twitter:image', content: image });
  }
  return tags;
}
