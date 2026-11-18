// What a host shows beside the tools: a name and a version alone leave the server a bare slug in
// its list, so this adds the title, the one-line description, the site and the app icon.
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

/** The icon is fetched by url: a host reads neither the repo nor the disk. */
const ICON_URL = 'https://raw.githubusercontent.com/wssdozh/slag-v2/main/src-tauri/icons/128x128.png';

export const SERVER_INFO: Implementation = {
  name: 'slag-notes',
  title: 'SLAG',
  version: '1.0.0',
  description: 'Личные заметки, задачи и статьи одного человека: markdown-файлы в локальном хранилище.',
  websiteUrl: 'https://github.com/wssdozh/slag-v2',
  icons: [{ src: ICON_URL, mimeType: 'image/png', sizes: ['128x128'] }],
};
