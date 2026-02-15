export function getFaviconUrl(domain: string | null | undefined, size: number = 64): string {
  /**
   * if
   */
  if (!domain) {
    return '';
  }
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=${size}`;
}

/**
 * handleFaviconError
 */
export function handleFaviconError(element: HTMLImageElement): void {
  const parent = element.parentElement;
  /**
   * if
   */
  if (parent) {
    element.style.display = 'none';
    const iconHtml = '<iconify-icon icon="solar:global-bold" width="24" class="text-neutral-300"></iconify-icon>';
    parent.innerHTML = iconHtml;
  }
}
