import { test, expect } from '../support/selfhostFixture';

/**
 * `decideResolve` is the whole policy for "the neighbour refused this note, may I stop insisting".
 *
 * It is a pure function behind the panel switch, and the rules are the promise: only notes that
 * were already on the wire before the resend, never a large batch, never a sizeable slice of the
 * vault. Everything else is the person's button.
 */
test('auto-resolve only touches notes the neighbour could have refused', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  const outcomes = await page.evaluate(async () => {
    const { decideResolve } = await import('/src/lib/sync/manifestResolve.ts');
    const drift = (extra: string[]) => ({ rootMatch: false, folders: [], extra, missing: [], conflict: [] });
    const extra = ['old', 'fresh'];
    const updatedAt = new Map([['old', 1_000], ['fresh', 9_000]]);
    const run = (over: Record<string, unknown>) =>
      decideResolve({
        drift: drift(extra),
        resentAt: 5_000,
        updatedAt,
        leaves: 100,
        enabled: true,
        ...over,
      } as Parameters<typeof decideResolve>[0]);
    return {
      refused: run({}),
      disabled: run({ enabled: false }),
      beforeResend: run({ resentAt: null }),
      tooMany: run({ drift: drift(Array.from({ length: 9 }, (_, index) => `x${index}`)) }),
      wide: run({ drift: drift(['a', 'b', 'c']), updatedAt: new Map([['a', 1], ['b', 1], ['c', 1]]), leaves: 10 }),
    };
  });

  // The old leaf was in the resend and the neighbour still has no such note: it refused it.
  expect(outcomes.refused).toEqual(['old']);
  // A leaf edited after the resend was never in front of the neighbour — "not yet", not "no".
  expect(outcomes.refused).not.toContain('fresh');
  expect(outcomes.disabled).toEqual([]);
  expect(outcomes.beforeResend).toEqual([]);
  expect(outcomes.tooMany).toEqual([]);
  // Three of ten is not a stray note; a broken replica must reach a person, not the trash.
  expect(outcomes.wide).toEqual([]);
});
