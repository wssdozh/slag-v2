import { test, expect } from '@playwright/test';

// Exercise the shared components directly, without account/vault state.
test('shared menus preserve positioning, selection and formatting', async ({ page }) => {
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
    const { formatBytes } = await import(/* @vite-ignore */ '/src/lib/formatBytes.ts');
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
          React.createElement(FolderSuggestionMenu, { query: '', folders: [{ path: 'inbox', name: 'inbox', description: '', icon: 'Folder' }], currentFolder: 'inbox', selectedIndex: 0, onSelect: () => {}, placement: 'bottom' })),
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
  const menu = page.locator('body > div').filter({ has: page.getByRole('button', { name: 'two', exact: true }) }).last();
  const firstPosition = await menu.boundingBox();
  const triggerPosition = await trigger.boundingBox();
  expect(firstPosition!.x).toBe(2);
  expect(firstPosition!.y).toBe(triggerPosition!.y + triggerPosition!.height + 6);
  expect(firstPosition!.width).toBe(150);
  await page.getByRole('button', { name: 'two', exact: true }).click();
  await expect(trigger).toContainText('two');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.mouse.click(600, 100);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#trigger').evaluate(el => { el.style.left = 'calc(100vw - 40px)'; el.style.top = 'calc(100vh - 50px)'; });
  await trigger.click();
  const edgePosition = await menu.boundingBox();
  const edgeTrigger = await trigger.boundingBox();
  expect(edgePosition!.x).toBe(page.viewportSize()!.width - 160 - 8);
  expect(edgePosition!.y + edgePosition!.height).toBe(edgeTrigger!.y - 6);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(async () => (await menu.boundingBox())!.x).toBe(900 - 160 - 8);
  await expect(page.locator('[data-folder-item="inbox"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-tag-item="test"]')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/screenshots/ui-refactor.png', fullPage: true });
});
