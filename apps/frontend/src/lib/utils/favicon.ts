export function getFaviconUrl(domain: string | null | undefined, size: number = 64): string {
  if (!domain) {
    return '';
  }
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=${size}`;
}

export function handleFaviconError(element: Element): void {
  const parent = element.parentElement;
  if (parent) {
    const iconHtml = '<iconify-icon icon="solar:global-linear" width="24" class="text-fc-fg-muted"></iconify-icon>';
    parent.innerHTML = iconHtml;
  }
}
