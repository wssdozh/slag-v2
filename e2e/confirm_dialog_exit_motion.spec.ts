// Regression: ConfirmDialog used to return null in the same commit that answered the
// question, so BaseModal/usePresence never got a frame to play the exit — the surface
// popped out while the rest of the app fades. These two scenarios sample the dialog every
// animation frame through the close and then replace the question inside that window.
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

const FILE_INPUT = 'input[aria-label="Восстановить из файла (.zip / .json)"]';
const DIALOG = '[role="alertdialog"]';

interface DialogFrame {
  state: string | null;
  inert: boolean;
  ariaHidden: string | null;
  opacity: number;
  text: string;
  focusInside: boolean;
}

async function openTransferTab(page: Page, testInfo: TestInfo) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupSlag(page, testInfo);
  await page.keyboard.press('Control+,');
  await page.locator('button[data-tab="vault"]').click();
  await page.getByTestId('vault-subtab-transfer').click();
}

/** Picks a ZIP through the real input; TransferSection asks before touching the vault. */
async function askToRestore(page: Page, name: string) {
  await page.locator(FILE_INPUT).setInputFiles({
    name,
    mimeType: 'application/zip',
    buffer: Buffer.from('PK\x05\x06' + '\x00'.repeat(18), 'binary'),
  });
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(name);
  return dialog;
}

/** Records one snapshot per animation frame: which phase, whether it still paints, who has focus. */
async function startFrameProbe(page: Page) {
  await page.evaluate(() => {
    const host = window as unknown as { __confirmFrames: DialogFrame[] };
    host.__confirmFrames = [];
    let frame = 0;
    const sample = () => {
      const dialog = document.querySelector('[role="alertdialog"]');
      if (!dialog) {
        host.__confirmFrames.push(null as unknown as DialogFrame);
      } else {
        const focused = document.activeElement;
        host.__confirmFrames.push({
          state: dialog.getAttribute('data-motion-state'),
          inert: dialog.hasAttribute('inert'),
          ariaHidden: dialog.getAttribute('aria-hidden'),
          opacity: Number(getComputedStyle(dialog).opacity),
          text: dialog.textContent ?? '',
          focusInside: focused instanceof Node && dialog.contains(focused),
        });
      }
      if (++frame < 120) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function readFrames(page: Page): Promise<(DialogFrame | null)[]> {
  return page.evaluate(() => (window as unknown as { __confirmFrames: (DialogFrame | null)[] }).__confirmFrames);
}

test('a cancelled question keeps its surface, inert, until the exit has played', async ({ page }, testInfo) => {
  await openTransferTab(page, testInfo);
  const input = page.locator(FILE_INPUT);
  await input.focus();

  await startFrameProbe(page);
  const dialog = await askToRestore(page, 'exit-check.zip');
  // Settled, not mid-entrance: the screenshot is for the layout of the question.
  await expect.poll(() => dialog.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  await page.screenshot({ path: 'test-results/screenshots/confirm-dialog-exit-open.png' });

  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);

  const frames = (await readFrames(page)).filter((frame): frame is DialogFrame => frame !== null);
  const exiting = frames.filter(frame => frame.state === 'exiting');

  // The surface was rendered in its exit phase instead of vanishing in the answering commit.
  expect(exiting.length).toBeGreaterThan(0);
  // During the exit the question is still readable, but the dialog is already closed to input
  // and to the accessibility tree — last pixels, no semantics.
  expect(exiting.some(frame => frame.text.includes('exit-check.zip'))).toBe(true);
  expect(exiting.every(frame => frame.inert && frame.ariaHidden === 'true')).toBe(true);
  // It actually fades: a parked opacity-0 frame would not prove a transition ran.
  expect(exiting.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  // Focus is handed back before the surface is gone, so nothing sits on a closing dialog.
  expect(exiting.every(frame => frame.focusInside === false)).toBe(true);
  await expect(input).toBeFocused();
});

test('a second question opened during the exit replaces the first on the same surface', async ({ page }, testInfo) => {
  await openTransferTab(page, testInfo);
  const input = page.locator(FILE_INPUT);
  await input.focus();

  await startFrameProbe(page);
  await askToRestore(page, 'first-question.zip');

  // Answer the first and ask the second from inside the page, so the gap stays inside the
  // 150 ms exit window instead of depending on test-runner round-trip time.
  await page.evaluate(({ dialogSelector, inputSelector }) => {
    const dialog = document.querySelector(dialogSelector);
    const cancel = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(button => button.textContent?.trim() === 'Отмена');
    cancel?.click();
    window.setTimeout(() => {
      const input = document.querySelector(inputSelector) as HTMLInputElement | null;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['PK\x05\x06'], 'second-question.zip', { type: 'application/zip' }));
      if (!input) return;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 20);
  }, { dialogSelector: DIALOG, inputSelector: FILE_INPUT });

  const dialog = page.locator(DIALOG);
  await expect(dialog).toContainText('second-question.zip');
  await expect(dialog).toHaveAttribute('data-motion-state', 'open');
  expect(await dialog.evaluate(element => element.hasAttribute('inert'))).toBe(false);
  // The old question is not left behind as a second, fading surface.
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await expect(page.locator(`${DIALOG}[data-motion-state="exiting"]`)).toHaveCount(0);
  // The new question takes focus the way a first one does, even though it appeared mid-exit.
  await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(FILE_INPUT)).toBeFocused();

  const states = (await readFrames(page))
    .filter((frame): frame is DialogFrame => frame !== null)
    .map(frame => frame.state);
  expect(states).toContain('exiting');
  expect(states).toContain('open');
});
