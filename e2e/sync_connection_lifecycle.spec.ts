import { test, expect } from './support/selfhostFixture';

test('intentional disconnect and socket replacement never schedule reconnects', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ modulePath);
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      onclose: ((event: { code: number }) => void) | null = null;
      onopen = null;
      onerror = null;
      onmessage = null;
      constructor(_url: string) { sockets.push(this); }
      close() { this.onclose?.({ code: 1000 }); }
    }
    const realWebSocket = window.WebSocket;
    window.WebSocket = FakeSocket as unknown as typeof WebSocket;
    const engine = new SyncEngine();
    // Exercise the shared connection lifecycle without key derivation or network traffic.
    engine.config.enabled = true;
    engine.activeRoomId = 'room_lifecycle_test';
    engine.connectWebSocket();
    engine.connectWebSocket();
    engine.disconnect();
    await new Promise(resolve => setTimeout(resolve, 6000));
    const afterIntentionalClose = sockets.length;
    // A fresh manual connection needs an active room again; disconnect clears it.
    engine.activeRoomId = 'room_lifecycle_test';
    engine.connectWebSocket();
    sockets.at(-1)!.onclose!({ code: 1006 });
    engine.disconnect();
    await new Promise(resolve => setTimeout(resolve, 6000));
    window.WebSocket = realWebSocket;
    return { afterIntentionalClose, afterCancelledRetry: sockets.length };
  });
  expect(result).toEqual({ afterIntentionalClose: 2, afterCancelledRetry: 3 });
});
