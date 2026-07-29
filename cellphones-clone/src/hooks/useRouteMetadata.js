import { useEffect } from 'react';
import { getRouteMetadata } from '../utils/routeRegistry';

const upsertMeta = (selector, attributes) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
};

const upsertCanonical = (href) => {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
};

export default function useRouteMetadata(route, search = '') {
  useEffect(() => {
    const metadata = getRouteMetadata(route, search);
    document.title = metadata.title;
    upsertMeta('meta[name="description"]', { name: 'description', content: metadata.description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: metadata.robots });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: metadata.type });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: metadata.canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: metadata.image });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertCanonical(metadata.canonical);

    let jsonLd = document.head.querySelector('script[data-route-jsonld]');
    if (!jsonLd) {
      jsonLd = document.createElement('script');
      jsonLd.type = 'application/ld+json';
      jsonLd.dataset.routeJsonld = 'true';
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': route?.pageType === 'product' ? 'Product' : 'WebPage',
      name: metadata.title,
      description: metadata.description,
      url: metadata.canonical,
    });
  }, [route, search]);
}
