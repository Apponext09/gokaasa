import { useEffect } from 'react';

function setMeta(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
}

/** Sets title, description, canonical URL and Open Graph tags for the current page. */
export function useDocumentMeta({ title, description, canonicalPath, image }) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), { content: description });
      setMeta('meta[property="og:description"]', () => Object.assign(document.createElement('meta'), { property: 'og:description' }), { content: description });
    }
    if (title) {
      setMeta('meta[property="og:title"]', () => Object.assign(document.createElement('meta'), { property: 'og:title' }), { content: title });
    }
    if (image) {
      setMeta('meta[property="og:image"]', () => Object.assign(document.createElement('meta'), { property: 'og:image' }), { content: image });
    }
    if (canonicalPath) {
      const href = `${window.location.origin}${canonicalPath}`;
      setMeta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), { href });
      setMeta('meta[property="og:url"]', () => Object.assign(document.createElement('meta'), { property: 'og:url' }), { content: href });
    }
  }, [title, description, canonicalPath, image]);
}
