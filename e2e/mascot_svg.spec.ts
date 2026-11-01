import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('Render and screenshot mascot SVG', async ({ page }) => {
  const svgPath = path.resolve('public/mascot-blueberry.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #08090a;
            height: 100vh;
            overflow: hidden;
          }
          .container {
            width: 512px;
            height: 512px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${svgContent}
        </div>
      </body>
    </html>
  `);

  await page.screenshot({
    path: 'test-results/screenshots/mascot_svg_preview.png',
    clip: { x: (1280 - 512) / 2, y: (720 - 512) / 2, width: 512, height: 512 },
  });
});
