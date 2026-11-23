import type { Page } from '@playwright/test';

/**
 * What a page asks the attachment store for, and which consumer asked: the feed's cards resolve
 * through `useAttachmentSrc`, the viewer and the pane through the on-demand hook. `asks` counts
 * every request (the store answers a repeat from memory), `reads` the ones that reached IndexedDB.
 */
export interface AttachmentProbe {
  asks: Array<{ id: string; source: string }>;
  reads: string[];
  payloadCharsById: Record<string, number>;
}

type ProbedWindow = { __attachmentReads: AttachmentProbe };

/** Installed before app code; sync is off because its one missing-bytes pass reads every attachment. */
export async function installAttachmentReadProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('slag_sync_config_v2') || key.startsWith('slag_sync_last_state_hash') || key === 'slag_account_session_v1') {
        localStorage.removeItem(key);
      }
    }
    const probe: AttachmentProbe = { asks: [], reads: [], payloadCharsById: {} };
    (window as unknown as ProbedWindow).__attachmentReads = probe;

    const sourceOf = (): string => {
      const stack = new Error().stack ?? '';
      if (stack.includes('useAttachmentSrcOnDemand')) return 'on-demand';
      if (stack.includes('media/useAttachmentSrc')) return 'feed';
      return 'other';
    };

    // The store keeps urls for the session, so a lazy consumer that asks later is answered from
    // memory and never reaches IndexedDB — the door of the store is where the ask is recorded.
    void (async () => {
      const { AttachmentStore } = await import('/src/lib/storage/attachments.ts') as unknown as {
        AttachmentStore: {
          prototype: {
            getUrl: (id: string, relativePath: string, mimeType?: string) => Promise<string | undefined>;
          };
        };
      };
      const original = AttachmentStore.prototype.getUrl;
      AttachmentStore.prototype.getUrl = function (id, relativePath, mimeType) {
        probe.asks.push({ id, source: sourceOf() });
        return original.call(this, id, relativePath, mimeType);
      };
    })();

    const originalGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      const request = originalGet.call(this, query);
      if (this.name === 'attachments' && typeof query === 'string') {
        const id = query;
        request.addEventListener('success', () => {
          const record = request.result as { dataUrl?: string } | null;
          probe.reads.push(id);
          probe.payloadCharsById[id] = Math.max(probe.payloadCharsById[id] ?? 0, record?.dataUrl?.length ?? 0);
        });
      }
      return request;
    } as typeof IDBObjectStore.prototype.get;
  });
}

export function readAttachmentProbe(page: Page): Promise<AttachmentProbe> {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbedWindow).__attachmentReads;
    return { asks: [...probe.asks], reads: [...probe.reads], payloadCharsById: { ...probe.payloadCharsById } };
  });
}

/** A real 1600×1200 photo, generated in the page so the fixture carries no binary files. */
export function generatePhotoDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d is unavailable');
    const fill = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    fill.addColorStop(0, '#1e293b');
    fill.addColorStop(0.5, '#4c1d95');
    fill.addColorStop(1, '#7c2d12');
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f4f4f5';
    context.font = '120px sans-serif';
    context.fillText('slag', 60, 200);
    return canvas.toDataURL('image/webp', 0.8);
  });
}
