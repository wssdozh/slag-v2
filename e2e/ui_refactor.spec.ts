import { test, expect } from '@playwright/test';

// Exercise the shared components directly, without account/vault state.
test('shared menus preserve positioning, selection and formatting', async ({ page }) => {
  // This test owns geometry: a popover leans in with `translate: 0 -6px`, and sampling its
  // box mid-flight measured the lean, not the anchor. Reduced motion drops the lean; the
  // anchoring, selection and formatting code under test is untouched.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(async () => {
    // Reuse the exact React instance the app already loaded, otherwise hooks get a second copy.
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name);
    const reactUrl = loaded.find(name => name.includes('/deps/react.js'));
    const clientUrl = loaded.find(name => name.includes('/deps/react-dom_client.js'));
    const reactModule = await import(reactUrl);
    const React = reactModule.default || reactModule;
    const clientModule = await import(clientUrl);
    const createRoot = clientModule.createRoot || clientModule.default?.createRoot;
    const { ResponsiveSegmented } = await import(/* @vite-ignore */ '/src/components/UI/ResponsiveSegmented.tsx');
    const { FolderSuggestionMenu } = await import(/* @vite-ignore */ '/src/components/Feed/FolderSuggestionMenu.tsx');
    const { TagSuggestionMenu } = await import(/* @vite-ignore */ '/src/components/Feed/TagSuggestionMenu.tsx');
    const { formatBytes } = await import(/* @vite-ignore */ '/src/lib/text/formatBytes.ts');
    const outputs = [undefined, 0, -1, 1023, 1024, 1048576].map(formatBytes);
    if (JSON.stringify(outputs) !== JSON.stringify(['', '', '', '1023 B', '1.0 KB', '1.0 MB'])) {
      throw new Error(`formatBytes changed: ${JSON.stringify(outputs)}`);
    }
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    function Demo() {
      const [value, setValue] = React.useState('one');
      return React.createElement('div', { style: { minHeight: 1000, padding: 24, color: 'white' } },
        React.createElement('div', { id: 'trigger', style: { position: 'fixed', left: 2, top: 20 } },
          React.createElement(ResponsiveSegmented, { compact: true, value, onChange: setValue, ariaLabel: 'test mode', options: [{ value: 'one', label: 'one' }, { value: 'two', label: 'two' }] })),
        React.createElement('div', { style: { position: 'relative', marginTop: 100, width: 300 } },
          React.createElement(FolderSuggestionMenu, { query: '', rows: [{ path: 'inbox', name: 'inbox', prefix: '', depth: 0, meta: { path: 'inbox', name: 'inbox', description: '', icon: 'Folder' } }], currentFolder: 'inbox', selectedIndex: 0, onSelect: () => {}, placement: 'bottom' })),
        React.createElement('div', { style: { position: 'relative', marginTop: 250, width: 300 } },
          React.createElement(TagSuggestionMenu, { query: '', tags: [{ tag: 'test', count: 3 }], selectedIndex: 0, onSelect: () => {}, placement: 'bottom' })));
    }
    createRoot(host).render(React.createElement(Demo));
  });
  const trigger = page.getByRole('button', { name: 'test mode' });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const optionTwo = page.getByRole('button', { name: 'two', exact: true });
  const menu = page.locator('body > div').filter({ has: optionTwo }).last();
  const viewport = page.viewportSize()!;

  // Anchored: the menu's left edge lines up with the trigger and sits 6px under it.
  const firstPosition = (await menu.boundingBox())!;
  const triggerPosition = (await trigger.boundingBox())!;
  expect(firstPosition.x).toBe(triggerPosition.x);
  expect(firstPosition.y).toBe(triggerPosition.y + triggerPosition.height + 6);
  // No magic width: the menu has to hold every option, and never hang off the viewport.
  for (const label of ['one', 'two']) {
    const option = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
    expect(option.x).toBeGreaterThanOrEqual(firstPosition.x);
    expect(option.x + option.width).toBeLessThanOrEqual(firstPosition.x + firstPosition.width);
    expect(option.y).toBeGreaterThanOrEqual(firstPosition.y);
    expect(option.y + option.height).toBeLessThanOrEqual(firstPosition.y + firstPosition.height);
  }
  expect(firstPosition.x).toBeGreaterThanOrEqual(0);
  expect(firstPosition.x + firstPosition.width).toBeLessThanOrEqual(viewport.width);

  await optionTwo.click();
  await expect(trigger).toContainText('two');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.mouse.click(600, 100);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  // No room below: the menu flips above the trigger and still fits the viewport.
  await page.locator('#trigger').evaluate(el => { el.style.left = 'calc(100vw - 40px)'; el.style.top = 'calc(100vh - 50px)'; });
  await trigger.click();
  const edgePosition = (await menu.boundingBox())!;
  const edgeTrigger = (await trigger.boundingBox())!;
  expect(edgePosition.y + edgePosition.height).toBe(edgeTrigger.y - 6);
  expect(edgePosition.x).toBeGreaterThanOrEqual(0);
  expect(edgePosition.x + edgePosition.width).toBeLessThanOrEqual(viewport.width - 8);
  // A viewport change re-anchors the open menu instead of leaving it off-screen.
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(async () => {
    const box = (await menu.boundingBox())!;
    return box.x + box.width <= 900 - 8;
  }).toBe(true);
  await expect(page.locator('[data-folder-item="inbox"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-tag-item="test"]')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/screenshots/ui-refactor.png', fullPage: true });
});
