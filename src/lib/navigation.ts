/**
 * Единственная точка перехода между страницами приложения (?page=…).
 * Раньше вход в кабинет делал `window.location.search = …`, что перезагружало
 * WebView и обнуляло историю — аппаратный Back после этого не возвращал в приложение.
 */
export function navigatePage(page: string | null, mode: 'push' | 'replace' = 'push') {
  const url = new URL(window.location.href);
  if (page) url.searchParams.set('page', page);
  else url.searchParams.delete('page');
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}
