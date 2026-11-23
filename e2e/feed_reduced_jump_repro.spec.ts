// Review regression for 9644c2a7: with reduced motion requested, the explicit jump to the newest
// note must land in one frame and must not show the return control on the way. Normal-motion
// smooth behaviour is out of scope here.
import { expect, test } from './support/selfhostFixture';
import type { SlagItem } from '../src/types';

test.use({ viewport: { width: 1280, height: 880 }, reducedMotion: 'reduce' });

function notes(): SlagItem[] {
  return Array.from({ length: 111 }, (_, index) => ({
    id: `reduced-${index}`, type: 'note', title: `Reduced ${index}`,
    content: `Body ${index}\n\nSeed line.`, folder: 'Входящие', tags: [], attachments: [],
    createdAt: 1_700_001_000_000 + index * 60_000, updatedAt: 1_700_001_000_000 + index * 60_000,
  }));
}

test('reduced motion: the explicit jump does not glide and does not flash the return control', async ({ page }) => {
  await page.addInitScript((seed) => {
    localStorage.setItem('slag_items_default_vault', JSON.stringify(seed));
  }, notes());
  await page.goto('/');
  const feed = page.getByTestId('feed-list-container');
  await expect(feed.locator('[data-flip-id]')).toHaveCount(15);
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  await feed.hover();
  await page.mouse.wheel(0, -900);
  await expect.poll(() => feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
    .toBeGreaterThan(220);

  const result = await page.evaluate(async () => {
    const host = window as unknown as {
      __jump: { frames: { now: number; top: number; dist: number; button: boolean }[]; running: boolean };
    };
    host.__jump = { frames: [], running: true };
    const container = document.querySelector<HTMLElement>('[data-testid="feed-list-container"]')!;
    const button = document.querySelector('button[aria-label="Прокрутить к последним заметкам"]');
    const wrapper = button?.closest('[aria-hidden]');
    const sample = () => {
      if (!host.__jump.running) return;
      host.__jump.frames.push({
        now: performance.now(), top: container.scrollTop,
        dist: container.scrollHeight - container.scrollTop - container.clientHeight,
        button: wrapper?.getAttribute('aria-hidden') === 'false',
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    (button as HTMLElement).click();
    const clickedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 650));
    host.__jump.running = false;
    const frames = host.__jump.frames;
    const moving = frames.filter((frame, index) => index > 0 && frame.top !== frames[index - 1].top);
    return {
      movementFrames: moving.length,
      movementMs: moving.length > 1 ? Math.round(moving.at(-1)!.now - moving[0].now) : 0,
      buttonDuring: frames.some((frame) => frame.now >= clickedAt && frame.button),
      finalDist: frames.at(-1)?.dist ?? Number.NaN,
    };
  });

  console.log(`[reduced-jump] ${result.movementFrames} moving frames over ${result.movementMs} ms, ` +
    `control during jump ${result.buttonDuring}, final ${result.finalDist.toFixed(0)} px`);
  // One write, one frame: reduced motion does not get a glide.
  expect(result.movementFrames).toBeLessThanOrEqual(1);
  // Intermediate unpinning must not surface the return control during an explicit jump.
  expect(result.buttonDuring).toBe(false);
  expect(result.finalDist).toBeLessThanOrEqual(40);
});
