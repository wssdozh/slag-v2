# CODE_MAP — карта модулей

Сгенерировано `npm run map:code`. Руками не править — перезапишется.
Читай эту карту до того, как грепать: колонка «импортят» показывает,
что модуль реально используется, «что это» — зачем он нужен.

Модулей: **494**, строк: **90559**, зон: **47**.

## Самые длинные файлы

| файл | строк | импортят |
|---|---:|---:|
| `src/lib/sync/bip39Words.ts` | 2052 | 1 |
| `e2e/slag/editor.spec.ts` | 1588 | 0 |
| `e2e/slag/views.spec.ts` | 1078 | 0 |
| `src/lib/sync/syncEngine.ts` | 929 | 18 |
| `e2e/mobile.spec.ts` | 886 | 0 |
| `e2e/slag/workspace.spec.ts` | 885 | 0 |
| `src/components/Feed/ItemCard.tsx` | 810 | 1 |
| `e2e/slag/feed.spec.ts` | 799 | 0 |
| `src/lib/storage/index.ts` | 741 | 38 |
| `src/context/AppContext.tsx` | 719 | 65 |
| `src/components/Feed/Composer.tsx` | 700 | 4 |
| `src/components/Editor/FullscreenEditor.tsx` | 640 | 1 |
| `src/lib/sync/account.ts` | 632 | 25 |
| `src/components/Workspace/useCrossWindowDnd.ts` | 614 | 1 |
| `src/lib/backupService.ts` | 606 | 1 |

## Кандидаты в мёртвый код

Никто не импортирует и сами ничего не экспортируют. Проверить и, скорее всего, выпилить.

- `src/node/index.ts` (25 строк)

## e2e (playwright) — 103 файлов, 20478 строк

Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:

- `e2e/slag/editor.spec.ts` — 1588
- `e2e/slag/views.spec.ts` — 1078
- `e2e/mobile.spec.ts` — 886
- `e2e/slag/workspace.spec.ts` — 885
- `e2e/slag/feed.spec.ts` — 799
- `e2e/adversarial_memory_time.spec.ts` — 567
- `e2e/assistant_memory.spec.ts` — 555
- `e2e/admin_panel.spec.ts` — 493
- `e2e/motion.spec.ts` — 451
- `e2e/adversarial_memory_contradictions.spec.ts` — 429

## src — 3 файлов, 581 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `App.tsx` | 450 | 1 | App | The app shell: routes, lazy-loaded screens, viewport height and global overla… |
| `demo.tsx` | 69 | 0 | Playground | A separate playground entry for eyeballing modals and settings on an isolated… |
| `main.tsx` | 62 | 0 |  | Boots the React root into #root, in StrictMode, after the secret store and gl… |

## src/components — 1 файлов, 56 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `InitialSyncBoundary.tsx` | 56 | 1 | InitialSyncBoundary | Holds the shell until the first sync settles, so nobody is shown half a vault. |

## src/components/Account — 1 файлов, 350 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountCabinet.tsx` | 350 | 1 | AccountCabinet | Full-page account cabinet: sign in, seed phrase, devices and vault sharing. |

## src/components/Admin — 9 файлов, 2542 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AdminPanel.tsx` | 412 | 1 | AdminPanel | Admin console shell: server/token login and five tabs over the relay's API. |
| `Charts.tsx` | 334 | 4 | DataPoint, SparklineChart, BarChart, FunnelChart, DistributionGauge | Dependency-free SVG charts — sparkline, bars, donut, funnel — for the admin t… |
| `tabs/AccountsTab.tsx` | 429 | 1 | AccountsTab | Admin accounts tab: search, plan/status filters, per-account actions, devices. |
| `tabs/AiTab.tsx` | 193 | 1 | AiTab | Admin AI tab: gateway status, request/token totals, model split and the call … |
| `tabs/BillingTab.tsx` | 327 | 1 | BillingTab | Admin billing tab: revenue, expiring plans, transactions and manual grants. |
| `tabs/RelayTab.tsx` | 235 | 1 | RelayTab | Admin relay tab: uptime, rooms, storage and the purge/cleanup/vacuum controls. |
| `tabs/SecurityTab.tsx` | 69 | 1 | SecurityTab | Admin security tab: blocked accounts, revoked devices, encryption note, audit… |
| `useAdminActions.ts` | 294 | 1 | GrantSubscriptionInput, AdminActionsDeps, useAdminActions | Admin mutations: plan changes, blocks, device revoke, grants and refunds. |
| `useAdminData.ts` | 249 | 7 | AdminStats, AdminDevice, AdminVault, AdminAccount, BillingStats, +7 | Admin data loader and its API types: stats, accounts, analytics, audit log. |

## src/components/Audio — 9 файлов, 1857 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioCoverArt.tsx` | 158 | 1 | AudioCoverArt | The album art stand-in: a live spectrum orb that settles once playback pauses. |
| `AudioPanel.tsx` | 281 | 2 | AudioPanel | The audio panel: track scope and type filters, transport controls, and the qu… |
| `AudioPlaylistDrawer.tsx` | 266 | 1 | AudioPlaylistDrawer | The play queue drawer: search, type filters, folder scope, and missing-bytes … |
| `liquidOrb.ts` | 419 | 1 | OrbFrame, createOrbRenderer | The canvas orb that breathes with the audio: blobs driven by spectrum feature… |
| `panel/AudioArtwork.tsx` | 74 | 1 | AudioArtwork | Cover tile plus the title parsed out of the file name, including the missing … |
| `panel/AudioScrubber.tsx` | 83 | 1 | AudioScrubber | The seek bar: click or drag anywhere on the track to scrub, time labels at bo… |
| `panel/AudioTransport.tsx` | 183 | 1 | AudioTransport | The transport row: play, skip, speed, shuffle, loop, mute, and the queue togg… |
| `panel/PlaylistDrawer.tsx` | 64 | 1 | PlaylistDrawer | Turns unresolved track sources into the drawer's missing-bytes list and rende… |
| `panel/useAudioPlayback.ts` | 329 | 1 | useAudioPlayback | Drives the one audio element: track index, play state, speed, loop, shuffle, … |

## src/components/Composer — 1 файлов, 103 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `QuickComposerWindow.tsx` | 103 | 1 | QuickComposerWindow | The transparent quick-capture window: hosts the composer and resets between i… |

## src/components/Editor — 11 файлов, 2722 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachmentStrip.tsx` | 242 | 1 | AttachmentStripProps, AttachmentStrip | The editor's attachment rail: reorder, remove, insert into the text, inline p… |
| `EditorToolbar.tsx` | 172 | 1 | EditorToolbar, EditorToolbarProps | Editor toolbar assembly: top row, markdown palette, save/zen actions. |
| `editorToolbarParts.tsx` | 75 | 5 | ITEM_TYPE_OPTIONS, MarkdownDropdown, EditorToolbarProps, EditorTopBarProps, MarkdownPaletteProps | Shared props, options and dropdown state for the editor toolbar halves. |
| `EditorTopBar.tsx` | 61 | 1 | EditorTopBar | Editor top row: back, folder selector, item type. |
| `fullscreen/EditorTaskFields.tsx` | 293 | 1 | EditorTaskFieldsProps, EditorTaskFields | The task row inside the editor: status, priority, due date, duration, recurre… |
| `fullscreen/useEditorAiActions.ts` | 72 | 1 | EditorAiActionsOptions, useEditorAiActions | The editor's two AI actions: file the draft into a folder plus tags, or pick … |
| `fullscreen/useEditorAttachments.ts` | 162 | 1 | EditorAttachmentsOptions, useEditorAttachments | Getting files into the editor: picker, drop, paste, and the `![[file]]` link … |
| `FullscreenEditor.tsx` | 640 | 1 | FullscreenEditor | The focused editor surface: CodeMirror wiring, hotkeys and the sheet's chrome. |
| `MarkdownPalette.tsx` | 364 | 1 | MarkdownPalette | Markdown utilities: history, styles, lists, inline formatting, links, attachm… |
| `MobileEditorBar.tsx` | 326 | 1 | MobileEditorBarProps, MobileEditorBar | The phone formatting bar: style, list and AI popovers above a single save but… |
| `useFullscreenDraft.ts` | 315 | 1 | UseFullscreenDraftOptions, UseFullscreenDraftReturn, useFullscreenDraft | The editor's draft: every editable field, dirty tracking, autosave and the sa… |

## src/components/Feed — 48 файлов, 7720 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ActiveFilterBadges.tsx` | 199 | 2 | ActiveFilterBadgesProps, ActiveFilterBadges | The removable chips for whatever narrows the feed: type, tag, folder, pinned. |
| `assistant/AssistantActionCard.tsx` | 398 | 1 | AssistantActionCard | The confirmation card for an AI action: what it will do, a diff, apply or dis… |
| `assistant/AssistantBanner.tsx` | 46 | 1 | AssistantBanner | Chat header strip: which folder the assistant is looking at, and clearing the… |
| `assistant/AssistantComposer.tsx` | 144 | 1 | AssistantComposer | The assistant's input row: model picker, send, and a nudge to connect when no… |
| `assistant/AssistantMessages.tsx` | 227 | 1 | AssistantMessages | The thread: empty-state prompts, message bubbles, tool traces, and scroll to … |
| `assistant/AssistantReasoning.tsx` | 40 | 1 | AssistantReasoning | Collapsible reasoning trace under a reply, with how long the model spent on i… |
| `assistant/AssistantSearchResults.tsx` | 111 | 1 | AssistantSearchResult, AssistantSearchResults | The search block of a reply: count, expand into the list, open a note or show… |
| `assistant/AssistantTextBubble.tsx` | 48 | 1 | AssistantTextBubble | One chat bubble: markdown with embedded task blocks split out of the same tex… |
| `assistant/AssistantToolCalls.tsx` | 28 | 1 | AssistantToolCalls | The mono trace of tool calls a reply made: name plus the query it ran, nothin… |
| `AssistantChat.tsx` | 235 | 2 | AssistantChat | The assistant view: thread state, input, expanded traces, and the diff it ope… |
| `BaseComposer.tsx` | 273 | 2 | BaseComposerProps, BaseComposer | The shared composer shell: growing textarea, slot layout, and the send plate. |
| `chat/ChatTaskBlock.tsx` | 53 | 1 | ChatTaskBlock | A task rendered inside a chat reply: title plus checkbox lines, read-only. |
| `Composer.tsx` | 700 | 4 | ComposerProps, Composer | The create-a-note form: wiring, the autocomplete overlay, and composition of … |
| `composer/ComposerAiButton.tsx` | 31 | 1 | ComposerAiButtonProps, ComposerAiButton | The +AI button: asks the model for folder and tags, spinning while the call r… |
| `composer/ComposerAttachmentStrip.tsx` | 113 | 1 | ComposerAttachmentStripProps, ComposerAttachmentStrip | The tray of what is about to be sent: attachment chips, each removable. |
| `composer/composerFields.ts` | 125 | 2 | ComposerDismissals, ComposerFieldSources, ComposerFields, resolveComposerFields | Merges what the draft text says with what was picked, skipping dismissed chip… |
| `composer/ComposerRecordButton.tsx` | 46 | 1 | ComposerRecordButtonProps, ComposerRecordButton | The recorder plate that stands in for send on an empty draft: hold, tap to sw… |
| `composer/ComposerReplyBanner.tsx` | 39 | 1 | ComposerReplyBannerProps, ComposerReplyBanner | The reply-to banner above the composer that collapses instead of vanishing. |
| `composer/ComposerTypeSelector.tsx` | 53 | 1 | ComposerTypeSelectorProps, ComposerTypeSelector | The note / task / article switch at the bottom of the composer. |
| `composer/useComposerAiTags.ts` | 70 | 1 | UseComposerAiTagsOptions, useComposerAiTags | +AI in the composer: writes the suggested folder and tags back as @ and # tok… |
| `composer/useComposerFiles.ts` | 156 | 1 | useComposerFiles | Files into the composer: picker, drop and paste, with no opinion on titles or… |
| `composer/useComposerSlashCommands.ts` | 144 | 1 | UseComposerSlashCommandsOptions, useComposerSlashCommands | What a `/command` does to the draft: swap the type, set a property, start a r… |
| `composer/useComposerSubmit.ts` | 204 | 1 | UseComposerSubmitOptions, useComposerSubmit | Turning the draft into a record on submit: reply link, files, AI tags, then r… |
| `ComposerTaskControls.tsx` | 258 | 1 | ComposerTaskControlsProps, ComposerTaskControls | The task-only composer controls: due date, duration, recurrence and priority. |
| `FeedColumnResizer.tsx` | 91 | 1 | FeedColumnResizer | Drag handles that set the feed's reading width and keep it as a CSS variable. |
| `FeedHeader.tsx` | 163 | 1 | FeedHeaderProps, FeedHeader | The feed's header: folder name and icon, filter badges, sort, materials toggl… |
| `FeedList.tsx` | 555 | 2 | FeedList | The feed: render window, sentinels and the composition of cards; the edges li… |
| `FolderSuggestionMenu.tsx` | 102 | 1 | FolderSuggestionMenu | The `@folder` autocomplete: filtered folder rows, the selected one, and place… |
| `item/itemAttachments.ts` | 142 | 5 | THUMB_MAX_HEIGHT, THUMB_MAX_WIDTH, CardShape, AttachmentGroups, AttachmentCounts, +11 | How a card's files split by kind, how many slots they get, and where their by… |
| `item/ItemAudioNotes.tsx` | 46 | 1 | ItemAudioNotesProps, ItemAudioNotes | The card's voice notes, a player each: waveform, transcript and the enrichmen… |
| `item/ItemCardActions.tsx` | 56 | 1 | ItemCardActionsProps, ItemCardActions | The card's corner: reply, and the way into the focus editor for an article. |
| `item/ItemFiles.tsx` | 85 | 1 | ItemFilesProps, ItemFiles | File attachments on a card: one download row each, with size and the summary. |
| `item/ItemImages.tsx` | 234 | 1 | ItemImagesProps, ItemImages | Pictures on a card: one hero or a deck of thumbs, each with OCR text to unfol… |
| `item/ItemReplyBanner.tsx` | 48 | 1 | ItemReplyBannerProps, ItemReplyBanner | The quoted line above a reply: jump to what it answers, or say it is gone. |
| `item/ItemSubtasks.tsx` | 83 | 1 | ItemSubtasksProps, ItemSubtasks | A task's subtasks: one counter, one toggleable line each, collapsible. |
| `item/ItemVideoNotes.tsx` | 42 | 1 | ItemVideoNotesProps, ItemVideoNotes | Video circle notes on a card: plays in place, the corner opens the full viewe… |
| `ItemCard.tsx` | 810 | 1 | ItemCardProps, ItemCard | One note in the feed: reply swipe, width, OCR/expansion state, and the slots … |
| `list/FeedDateBubble.tsx` | 22 | 1 | FeedDateBubbleProps, FeedDateBubble | The day separator between feed groups: today, yesterday, or a plain date. |
| `list/FeedDropOverlay.tsx` | 31 | 1 | FeedDropOverlayProps, FeedDropOverlay | The dashed frame over the feed while files hover: what dropping them will do. |
| `list/FeedScrollHint.tsx` | 73 | 1 | FeedScrollHintProps, FeedScrollHint | Two floating tips at the feed edges: pull-to-search, and a jump to the newest… |
| `list/feedWindow.ts` | 92 | 1 | WINDOW_CHUNK, takeWindow, hasOlderItems, nextWindowSize, windowSizeAroundTarget, +3 | Pure windowing for the feed: how many cards stay mounted and when to grow the… |
| `PinnedBanner.tsx` | 218 | 1 | PinnedBanner | The pinned strip over the feed: cycles this folder's pinned notes and jumps t… |
| `SlashCommandMenu.tsx` | 102 | 1 | SlashCommandMenu | The `/` command list: filtered by the typed query, grouped by category. |
| `SuggestionMenuHeader.tsx` | 29 | 4 | SuggestionMenuHeader | The shared header of composer suggestions, with key hints only for a precisio… |
| `SuggestionMenuShell.tsx` | 62 | 4 | SuggestionMenuShell | Shared placement and presence for the suggestion lists, plus keeping the row … |
| `TagSuggestionMenu.tsx` | 76 | 2 | TagMeta, TagSuggestionMenu | The `#tag` suggestions: matching vault tags with usage counts, keyboard selec… |
| `useComposerAutocomplete.ts` | 396 | 1 | UseComposerAutocompleteOptions, useComposerAutocomplete | The composer's suggestions: which trigger is open, what it matches, and apply… |
| `useComposerDraft.ts` | 421 | 1 | ComposerDraftState, UseComposerDraftOptions, reviveReplyTarget, useComposerDraft | The composer draft on disk: restore, autosave, reset, and repairing pre-reply… |

## src/components/FolderProfile — 7 файлов, 700 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderActionsMenu.tsx` | 48 | 1 | FolderActionsMenuProps, FolderActionsMenu | The one ⋯ menu for a folder: rename, move and delete in every container. |
| `FolderIconGrid.tsx` | 35 | 1 | FolderIconGridProps, FolderIconGrid | Icon picker grid shared by the desktop popover and the phone sheet. |
| `FolderProfile.tsx` | 106 | 3 | FolderProfileProps, FolderProfile | One folder profile in three containers: dock panel, modal and phone screen. |
| `FolderProfileHeader.tsx` | 229 | 1 | FolderProfileVariant, FolderProfileHeaderProps, FolderProfileHeader | Folder header: name, icon, path, counters and the inline edit controls. |
| `FolderStats.tsx` | 95 | 1 | FolderStatsVariant, FolderStatsProps, FolderStats | The folder's six counters, laid out as rows, an inline strip or a grid. |
| `folderStatsConfig.ts` | 36 | 2 | FolderStatKey, FolderStatDefinition, FOLDER_STATS, recordCountLabel | The single list of folder counters, labels and the Russian record count. |
| `useFolderProfileEdit.ts` | 151 | 2 | FolderProfileEditMode, FolderProfileEditOptions, FolderProfileEdit, useFolderProfileEdit | Inline folder editing: one field at a time, committed through the storage act… |

## src/components/Landing — 1 файлов, 503 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LandingPage.tsx` | 503 | 1 | LandingPage | The public page: what SLAG is, what it costs, and the way into the app or the… |

## src/components/Logs — 2 файлов, 465 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LogModal.tsx` | 24 | 2 | LogModal | Modal shell for the log viewer: opens from the global hotkey and closes above… |
| `LogViewer.tsx` | 441 | 3 | LogViewer | The log panel: filters by scope and level, copy and clear, docked and modal v… |

## src/components/Media — 9 файлов, 1410 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachSheet.tsx` | 204 | 1 | AttachSheet | The one place that attaches things: device picker on a phone, system dialog o… |
| `DesktopSources.tsx` | 84 | 1 | DesktopSourcesProps, DesktopSources | Desktop's attach shortcuts: images, files and voice, each behind a system dia… |
| `FolderBrowser.tsx` | 144 | 1 | FolderBrowserProps, FolderBrowser | The files tab: folders already granted, their contents, and the system dialog… |
| `MediaGrid.tsx` | 328 | 1 | MediaGridProps, MediaGrid | The device gallery grid: paged cells whose thumbnails decode only as they scr… |
| `MediaPreview.tsx` | 235 | 1 | MediaPreviewProps, MediaPreview | Fullscreen photo and video viewer: paging, chrome that idles away, full bytes… |
| `MobilePicker.tsx` | 115 | 1 | MobilePickerProps, MobilePicker | The phone picker: photo, video, audio and file tabs over one selection, plus … |
| `useDeviceGallery.ts` | 81 | 1 | useDeviceGallery | Paged device gallery rows, with the permission state kept next to the items. |
| `useFolderBrowser.ts` | 91 | 1 | useFolderBrowser | Granted folders and the entries inside one, loaded only while the picker is o… |
| `ViewerVideo.tsx` | 128 | 2 | ViewerVideoProps, ViewerVideo | A clip in the viewer: custom transport that hides with the chrome, and play m… |

## src/components/Mobile — 19 файлов, 2856 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendar/AgendaDayGroup.tsx` | 156 | 1 | AgendaDayGroupProps, AgendaDayGroup | One day of the agenda: its heading, the now line, task rows, and adding a tas… |
| `calendar/AgendaOverdueSection.tsx` | 45 | 1 | AgendaOverdueSectionProps, AgendaOverdueSection | The overdue block above the week: counted, tinted red, and absent when empty. |
| `calendar/CalendarHeader.tsx` | 98 | 1 | CalendarHeaderProps, CalendarHeader | The phone calendar's top row: month dropdown, today button, agenda / 3-day sw… |
| `calendar/calendarPositions.ts` | 127 | 5 | HOURS_24, HOUR_HEIGHT, CalendarSlotTarget, AgendaDayLayout, realTaskId, +8 | Pure agenda and time-grid geometry: row order, now line, hour rail and pixels… |
| `calendar/calendarRange.ts` | 125 | 5 | MobileCalendarMode, CalendarDay, parseISODate, buildWeekDays, buildThreeDayWindow, +7 | Pure date math for the phone calendar: week strip, three-day window, month he… |
| `calendar/CalendarTaskRow.tsx` | 90 | 2 | CalendarTaskRowProps, CalendarTaskRow | One line of the agenda: status, time, title, folder, and the button for task … |
| `calendar/MonthPickerSheet.tsx` | 147 | 1 | MonthPickerSheetProps, MonthPickerSheet | The month sheet: a month grid with a dot on days that have tasks, and a today… |
| `calendar/ThreeDayGrid.tsx` | 242 | 1 | ThreeDayGridProps, ThreeDayGrid | The 24-hour three-day grid: day headers, all-day band, hour rail, and timed b… |
| `calendar/WeekStrip.tsx` | 74 | 1 | WeekStripProps, WeekStrip | The seven-day strip: weekday, number, and a dot when that day has tasks. |
| `MobileAssistantView.tsx` | 72 | 1 | MobileAssistantView | The phone's assistant tab: a chat under a screen header, scoped to the open f… |
| `MobileAudioView.tsx` | 13 | 1 | MobileAudioView | Phone frame for the audio panel: safe-area padding and nothing of its own. |
| `MobileCalendarView.tsx` | 434 | 3 | MobileCalendarView | The phone calendar: agenda and three-day modes, day swipes, and a month picke… |
| `MobileFloatingDock.tsx` | 160 | 1 | MobileFloatingDockProps, MobileFloatingDock | The floating tab dock at the bottom of the phone shell, with its capture butt… |
| `MobileFolderInfoView.tsx` | 71 | 1 | MobileFolderInfoView | Phone folder page: the profile fills the screen and editing happens in place. |
| `MobileFoldersView.tsx` | 391 | 1 | MobileFoldersView | The phone folder screen: header, feed/Kanban/calendar switch, and the pinned … |
| `MobileScreenHeader.tsx` | 87 | 5 | MobileScreenHeaderProps, MobileScreenHeader | The phone screen's top bar: back, title slots, and the status-bar inset. |
| `MobileSettingsView.tsx` | 134 | 1 | MobileSettingsView | The phone settings tab: grouped rows, live sync status, and the vault switche… |
| `MobileShell.tsx` | 113 | 1 | MobileShell | The phone shell: which tab is on screen, and the edge swipe that goes back. |
| `MobileTasksView.tsx` | 277 | 1 | MobileTasksView | The phone tasks tab: status tabs you swipe between, plus the calendar mode. |

## src/components/Modals — 10 файлов, 2371 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `BaseModal.tsx` | 157 | 10 | BaseModalProps, BaseModal | The dialog frame every modal wears: presence, backdrop, header, footer, Escap… |
| `ComposerModal.tsx` | 60 | 2 | ComposerModal | The composer in a dialog: keeps its last options and folder through the exit. |
| `ConfirmDialog.tsx` | 56 | 1 | ConfirmDialog | The app's own yes/no for destructive actions, instead of the platform's confi… |
| `DiffModal.tsx` | 533 | 1 | DiffModalItemEntry, DiffModalProps, DiffModal | What an AI edit would change, before it is applied: the line diff and the acc… |
| `FolderInfoModal.tsx` | 95 | 2 | FolderInfoModal | The folder dialog: its profile, plus triage, a new note, and its tags as filt… |
| `FolderModal.tsx` | 167 | 2 | FolderModal | Creating a folder: name, parent and icon; editing that lives in the folder pr… |
| `FolderViewModal.tsx` | 319 | 2 | FolderViewModal | The per-folder view settings sheet: layout, sort, filters, and resetting them. |
| `SettingsModal.tsx` | 215 | 2 | SettingsModal | The settings shell: a rail of tabs, the mobile and desktop frames, and the pi… |
| `TriageModal.tsx` | 485 | 1 | TriageModal | AI triage of the inbox: one batch of notes, folders and tags confirmed in a s… |
| `VaultModal.tsx` | 284 | 2 | VaultModal | The vault switcher: choose a store, create one on a backend, or delete one. |

## src/components/RightPanel — 3 файлов, 449 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderInfoPanel.tsx` | 19 | 1 | FolderInfoPanel | Dock-width container for the folder profile, bound to the current folder. |
| `FolderMediaTabs.tsx` | 312 | 1 | FolderMediaTabsProps, FolderMediaTabs | Folder media browser: images, audio, files, links and tags in one tab strip. |
| `useFolderMedia.ts` | 118 | 4 | FolderMediaData, useFolderMedia | Collects a folder's attachments, links and tags and resolves their bytes once. |

## src/components/Search — 1 файлов, 460 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SearchModal.tsx` | 460 | 3 | SearchModal | The ⌘K palette: one query, hits grouped by kind, and keyboard navigation thro… |

## src/components/Settings — 25 файлов, 3590 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountSettingsTab.tsx` | 195 | 1 | AccountSettingsTab | First settings tab: who you are, how much you have done, plan limits and wher… |
| `ActivityHeatmap.tsx` | 123 | 1 | ActivityHeatmap | A year of activity as GitHub draws it: one column per week, one square per da… |
| `ai/ConnectionEditor.tsx` | 95 | 1 | ConnectionEditor | One connection's fields: label, endpoint, key, protocol and the per-role mode… |
| `ai/ConnectionsSection.tsx` | 93 | 1 | ConnectionsSection | The list of connections: a row per provider, expanding into its editor. |
| `ai/RolesSection.tsx` | 55 | 1 | RolesSection | Who does what: answer, vision and speech, each picking one connection. |
| `ai/useAiSettingsForm.ts` | 129 | 1 | AiSettingsForm, useAiSettingsForm | The AI settings form's one state: connections, roles and the flags, with thei… |
| `AiSettingsTab.tsx` | 190 | 1 | AiSettingsTab | Where the model comes from — subscription or your own connections — and what … |
| `devices/DeviceActions.tsx` | 148 | 2 | DeviceName, DeviceRevokeButton, LocalSyncModeGroup, PairDeviceButton, PairDeviceModal | Device row widgets: inline rename, revoke, and the local sync mode picker. |
| `devices/DeviceCard.tsx` | 25 | 1 | DeviceCard | The modal shell that shows one device and the vaults it can reach. |
| `devices/DeviceList.tsx` | 72 | 1 | DeviceList | Connected devices: this machine first, then each paired one with its status. |
| `devices/DevicePermissions.tsx` | 59 | 1 | DevicePermissions | Per-device vault access dialog: grant mode and a toggle for each vault. |
| `devices/useDevicePairing.ts` | 320 | 2 | DevicePairingController, useDevicePairing | Pairing controller: host PIN, guest claim, SAS approval and the polling loop. |
| `DevicesSettingsTab.tsx` | 197 | 1 | DevicesSettingsTab | Devices tab: paired machines, per-device vault access, and the pairing flow. |
| `LogsSettingsTab.tsx` | 12 | 1 | LogsSettingsTab | The log viewer, docked inside settings instead of floating over the feed. |
| `MemoryList.tsx` | 94 | 1 | MemoryList | The assistant's memory in settings: what it thinks it knows, and the way to c… |
| `MobileDockSettings.tsx` | 231 | 1 | MobileDockSettings | Edits the phone dock: which tabs appear, in what order, dragged into place. |
| `NotificationsSettingsTab.tsx` | 244 | 1 | NotificationsSettingsTab | Notifications: one telegram channel per person, what it carries, and when it … |
| `NotifyInviteModal.tsx` | 154 | 1 | NotifyInviteModal | «Ждём подтверждения»: one live code, one progress line, and a link that actua… |
| `SecretKeyField.tsx` | 50 | 1 | SecretKeyField | One-line secret input with a per-field reveal toggle and no autocorrect. |
| `SettingsUI.tsx` | 297 | 19 | SettingsGroup, SettingsDivider, SettingsRow, SettingsSwitch, SettingsSelect, +2 | Settings' shared building blocks: group cards, rows, dividers, switches, sele… |
| `ShortcutsSettingsTab.tsx` | 101 | 1 | ShortcutsSettingsTab | The hotkey catalogue, rendered from the same table the keydown handler reads. |
| `StorageUsageSection.tsx` | 297 | 1 | StorageUsageSection | "Занятое место": the whole store's footprint — local keys, media, snapshots a… |
| `SyncSettingsTab.tsx` | 84 | 1 | SyncSettingsTab | The sync channel: status, server address, schedule; account and devices sit n… |
| `UiSettingsTab.tsx` | 102 | 1 | UiSettingsTab | How it looks: accent, fonts, density, panel widths and the mobile dock. |
| `VaultSettingsTab.tsx` | 223 | 1 | VaultSettingsTab | The vault itself: backups, snapshots, export and import, and the folders on d… |

## src/components/Sidebar — 3 файлов, 501 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `folderIcons.ts` | 38 | 7 | FOLDER_ICONS | The icon set a folder can pick from, keyed by the name stored in its meta. |
| `FolderTree.tsx` | 258 | 1 | FolderTree | Nested folder tree in the sidebar: expand, select, drag items between branche… |
| `Sidebar.tsx` | 205 | 1 | Sidebar | Left rail: vault switcher, folder tree, inbox, sync state and settings shortc… |

## src/components/UI — 32 файлов, 5186 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioPlayer.tsx` | 383 | 4 | AudioPlayer | Plays a note's audio: waveform scrub, speed, transcript and on-demand enrichm… |
| `AudioRecorder.tsx` | 193 | 2 | AudioRecorder | Records a voice memo in a bottom bar, previews its length, then hands the cli… |
| `Button.tsx` | 57 | 6 | ButtonProps, Button | The kit's one button: four tones, three sizes, optional icon, ref-forwarded. |
| `Checkbox.tsx` | 76 | 2 | CheckboxProps, Checkbox | A checkbox with a label and hint, toggled by click or keyboard for settings r… |
| `ContextMenu.tsx` | 318 | 1 | ContextMenu | Right-click menu for items, folders and feed rows: sections, submenus and hov… |
| `DatePickerPopover.tsx` | 234 | 2 | DatePickerPopoverProps, DatePickerPopover | Picks a due date: month grid, quick today/tomorrow/next-week, and a clear act… |
| `EmptyState.tsx` | 32 | 2 | EmptyStateProps, EmptyState | The shared blank slate: an icon, one line of why it is empty, an optional act… |
| `IconButton.tsx` | 51 | 6 | IconButtonProps, IconButton | Square icon-only button in three sizes and three tones, for dense toolbars. |
| `ImageLightbox.tsx` | 360 | 3 | ImageLightboxProps, ImageLightbox, LightboxImage | The feed's media viewer: swipeable photos and clips, keyboard nav, OCR side p… |
| `LightboxTextPanel.tsx` | 151 | 1 | LightboxTextPanelProps, LightboxTextPanel | OCR results beside a photo in the lightbox, with copy and retry when the pass… |
| `MarkdownRenderer.tsx` | 207 | 4 | MarkdownRenderer | Renders markdown with GFM and turns Obsidian [[wiki links]] into in-app jumps. |
| `menu/feedMenuSections.tsx` | 83 | 1 | FeedMenuSectionsProps, FeedMenuSections | Feed right-click entries: the three create actions plus folder and search jum… |
| `menu/folderMenuSections.tsx` | 89 | 1 | FolderMenuSectionsProps, FolderMenuSections | Folder right-click entries: info, new subfolder, explorer and the guarded del… |
| `menu/itemMenuSections.tsx` | 206 | 1 | ItemMenuSectionsProps, ItemMenuSections | Item right-click entries: reply, pin, type switch, AI split, copy and delete. |
| `menu/MenuSubmenus.tsx` | 230 | 4 | MenuSubmenuName, MenuSubmenusProps, MenuSubmenus | The flyout panels of the context menu: more actions, type switch and explorer. |
| `MenuDropdown.tsx` | 189 | 4 | MenuDropdownProps, MenuDropdown | Anchored popover menu that flips and clamps itself inside the viewport, porta… |
| `MobileActionSheet.tsx` | 187 | 1 | MobileActionSheet | Phone action sheet for a feed item: drag to dismiss, the same actions as righ… |
| `NumberInput.tsx` | 99 | 1 | NumberInputProps, NumberInput | Stepper input: minus/plus buttons and a typed value, clamped to min/max on bl… |
| `PriorityBadge.tsx` | 76 | 5 | TaskPriority, LinearSignalBarsProps, LinearSignalBars | Priority as four Linear-style signal bars, plus the matching badge for task r… |
| `priorityTone.ts` | 47 | 4 | PriorityTone, priorityTone, PRIORITY_TONE_TEXT, PRIORITY_TONE_DOT, PRIORITY_TONE_CHIP | Maps a priority to its one colour family; text, dot and chip classes hang off… |
| `ResponsiveSegmented.tsx` | 249 | 7 | SegmentedOption, ResponsiveSegmentedProps, ResponsiveSegmented | Segmented control that collapses into a dropdown once the row no longer fits. |
| `segmentedVariants.ts` | 56 | 2 | SegmentedVariant, SegmentedStripClasses, SEGMENTED_STRIP_CLASSES | Class presets for the segmented strip, so mobile headers share one geometry. |
| `Select.tsx` | 353 | 11 | SelectOption, SelectProps, Select | The app's own select: grouped options, icons, colours, a portal list and plac… |
| `SendButton.tsx` | 49 | 4 | SendButtonProps, SendButton | The round accent arrow that confirms: send, attach or save, one plate for all… |
| `SheetPanel.tsx` | 440 | 2 | SheetPanelApi, SheetPanelProps, SheetPanel | The bottom-sheet shell: detents, drag-to-fold, velocity-aware release, scroll… |
| `TagChip.tsx` | 82 | 5 | TagChipProps, TagChip | A tag as a chip: clickable to filter, removable while editing, flat or pill. |
| `TaskStatusMark.tsx` | 50 | 4 | TaskStatusMarkProps, TaskStatusMark | Round task status glyph whose check stroke draws itself when the task is comp… |
| `Toast.tsx` | 173 | 2 | ToastContainer | The toast stack: pauses on hover, flicks away, carries one action or an undo. |
| `ToolbarButton.tsx` | 59 | 3 | ToolbarButtonProps, ToolbarButton | Square toolbar button with an active glow, for editor, calendar and view chro… |
| `VideoCirclePlayer.tsx` | 143 | 3 | VideoCirclePlayer | Round Telegram-style video bubble: tap to play, mute toggle, progress ring. |
| `VideoRecorder.tsx` | 213 | 1 | VideoRecorder | Records a video memo with a live preview, then hands the clip to the composer. |
| `WindowControls.tsx` | 51 | 1 | WindowControls | Desktop-only minimize/maximize/close cluster pinned to the window's top-right… |

## src/components/Vault — 1 файлов, 229 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `VaultSwitcherMenu.tsx` | 229 | 3 | VaultSwitcherMenuProps, VaultSwitcherMenu | Vault switcher as a dropdown or phone sheet: pick, create, reveal, delete. |

## src/components/Views — 13 файлов, 2665 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `CalendarDrawer.tsx` | 272 | 1 | CalendarDrawerProps, CalendarDrawer | The calendar's side drawer: overdue and unscheduled tasks, draggable onto the… |
| `CalendarExpandedDayModal.tsx` | 185 | 1 | CalendarExpandedDayModalProps, CalendarExpandedDayModal | A single day blown up: all of its tasks, with add, drag and complete right th… |
| `calendarHelpers.ts` | 67 | 4 | getPriorityBadge, cleanTimeFromTitle, formatDurationBadge | Calendar-only lookups: the priority badge palette, duration label, title clea… |
| `CalendarMonthView.tsx` | 211 | 1 | CalendarMonthViewProps, CalendarMonthView | The month grid: six weeks of cells, the task pills in each, and drop zones wh… |
| `CalendarTaskBlock.tsx` | 340 | 1 | AllDayTaskPillProps, AllDayTaskPill, TimedTaskBlockProps, TimedTaskBlock | The two task shapes on the calendar: the all-day pill and the timed block wit… |
| `CalendarView.tsx` | 548 | 1 | CalendarView | The desktop calendar: month and week grids, drag to reschedule, and the overd… |
| `kanban/KanbanCard.tsx` | 219 | 1 | KanbanCardProps, KanbanCard | A task card on the board: status glyph, key, due date, tags, and its drag han… |
| `kanban/KanbanColumn.tsx` | 117 | 1 | KanbanColumnProps, KanbanColumn | One board column: header with counter, its cards, the drop highlight, an add … |
| `kanban/KanbanMaterialsDock.tsx` | 193 | 1 | KanbanMaterialsDockProps, KanbanMaterialsDock | The materials dock: the folder's notes and articles, searchable, draggable on… |
| `kanban/kanbanModel.ts` | 33 | 5 | KanbanColumnIconType, KanbanColumnConfig, KANBAN_COLUMNS, isOverdue, getTaskKey | Kanban columns config plus the small pure helpers the board and its cards sha… |
| `kanban/KanbanStatusIcon.tsx` | 34 | 2 | KanbanStatusIconProps, KanbanStatusIcon | The Linear-style status glyph shared by a column header and the card's quick … |
| `KanbanBoard.tsx` | 169 | 2 | KanbanBoard | The Kanban board: columns by status, drag between them, and the materials doc… |
| `useCalendarInteractions.ts` | 277 | 1 | DEFAULT_HOUR_HEIGHT, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT, TimelineResizingState, ResizingTaskState, +1 | Timeline state: zooming the hour ruler by dragging it, and stretching a task'… |

## src/components/Workspace — 5 файлов, 1508 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `dockPanelUtils.ts` | 217 | 4 | WORKSPACE_LAYOUT_KEY, wsLog, PANELS_TO_ADD, PANEL_CONSTRAINTS, getPanelMinWidth, +5 | The workspace panel registry: ids, icons, width limits, and layout persistenc… |
| `GroupHeaderActions.tsx` | 111 | 1 | GroupHeaderActions | The `+` menu on a dock group: spawns another panel inside that same group. |
| `useCrossWindowDnd.ts` | 614 | 1 | DropPreviewRect, DropTargetResult, UseCrossWindowDndOptions, useCrossWindowDnd | Dragging a note between workspace panels: the preview rect, the drop target u… |
| `useDockPanels.ts` | 275 | 1 | UseDockPanelsOptions, useDockPanels | Dockview wiring: default layout, panel creation, tab menus, and saving the la… |
| `WorkspaceShell.tsx` | 291 | 1 | WorkspaceShellProps, WorkspaceShell | The desktop workspace: the dockview shell holding feed, Kanban, calendar, aud… |

## src/config — 8 файлов, 428 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ai.ts` | 87 | 1 | AI_ENDPOINTS, DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT, AI_LIMITS, AI_STOP_TAGS, +1 | Default endpoints, models and size limits for every AI provider the app can r… |
| `index.ts` | 8 | 91 | * from ./storage, * from ./sync, * from ./ai, * from ./search, * from ./ui, +1 | Barrel: re-exports storage, sync, AI, search, UI and typography config as one… |
| `search.ts` | 10 | 1 | SEARCH_LIMITS | Tuning for the Orama index and the palette: result counts, typo tolerance, te… |
| `settingsTabs.ts` | 35 | 4 | SettingsTabId, SettingsTabDefinition, SETTINGS_TABS, settingsTabLabel | Names and orders the settings sections once, so desktop and mobile cannot dri… |
| `storage.ts` | 97 | 3 | DEFAULT_INBOX_FOLDER, STORAGE_KEYS, DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_VAULT_META, +1 | localStorage keys, the default inbox name and the workspace state a new vault… |
| `sync.ts` | 45 | 1 | DEFAULT_SYNC_SERVER_URL, OFFICIAL_SYNC_DOMAINS, SYNC_STORAGE_KEYS, SYNC_INTERVALS, SYNC_ATTACHMENT_MAX_BYTES, +1 | Sync defaults: relay URL, storage keys, retry and debounce timings, bundle si… |
| `typography.ts` | 82 | 3 | FontFamilyOption, FONT_FAMILY_OPTIONS, FontScaleOption, FONT_SCALE_OPTIONS, getFontScaleMultiplier, +1 | Font families and size scales the interface offers, as CSS stacks and multipl… |
| `ui.ts` | 64 | 2 | ACCENT_COLORS, UI_BREAKPOINTS, UI_LAYOUT, UI_DELAYS, UI_GESTURES | Accent presets, not a free picker: one hex repaints the whole accent family in |

## src/context — 2 файлов, 948 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AppContext.tsx` | 719 | 65 | AppContext, AppProvider, useApp, ToastMessage, AttachSheetRequest, +1 | The single state hub: vault, folders, items, overlays, sync and every action. |
| `appContext.types.ts` | 229 | 8 | ToastMessage, AttachSheetRequest, ContextMenuTarget, AppContextType | The context's public contract and the shapes passed around it, kept out of st… |

## src/context/feed — 1 файлов, 90 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `feedView.ts` | 90 | 1 | FeedViewQuery, selectVisibleItems | Which records the feed shows and in what order — the inbox's three modes as a… |

## src/context/hooks — 11 файлов, 1541 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAppearance.ts` | 95 | 1 | useAppearance | Density, font and accent: presets to localStorage and then to CSS variables. |
| `useAssistant.ts` | 113 | 1 | useAssistant | The assistant session: transcript, model choice and one send that never write… |
| `useBackup.ts` | 146 | 1 | useBackup | Backups: scheduled and manual snapshots on disk, restore, and the zip round t… |
| `useFeedView.ts` | 216 | 1 | useFeedView | The feed's view state: folder, mode, filters, sorting, persisted per folder. |
| `useFolderAdmin.ts` | 102 | 1 | useFolderAdmin | A folder's own writes: save, describe, rename, delete and the create modal. |
| `useItemWrites.ts` | 223 | 1 | ItemWritesDeps, useItemWrites | Every write to a note: create, save, delete, restore from trash, move, comple… |
| `useMobileNav.ts` | 131 | 1 | DEFAULT_MOBILE_DOCK_TABS, useMobileNav | Which phone surface is showing and how we got there: tabs, push, pop, dock or… |
| `useNotifyArm.ts` | 69 | 1 | useNotifyArm | Keeps the relay armed with the current reminders and fires the local ones. |
| `useOverlays.ts` | 236 | 1 | useOverlays | Everything above the app: modals, lightbox, context menu, toasts, confirm, at… |
| `useRecurringRollover.ts` | 64 | 1 | useRecurringRollover | Rolls recurring tasks over at midnight and after the tab wakes, with no user. |
| `useVaults.ts` | 146 | 1 | useVaults | A vault's own writes: switch, create, delete, pick its folder and reveal it o… |

## src/hooks — 3 файлов, 686 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useCalendarSchedule.ts` | 128 | 3 | CalendarTask, UseCalendarScheduleParams, CalendarScheduleResult, useCalendarSchedule | Splits tasks into overdue, unscheduled and per-day buckets, expanding recurre… |
| `useItemActions.ts` | 281 | 4 | PRIORITY_LABELS, TYPE_LABELS, useItemActions | The action set behind every item menu: open, reply, pin, move, decompose, del… |
| `useSuggestedActions.ts` | 277 | 1 | ActionHistoryEntry, useSuggestedActions | Applies, rejects and undoes the actions the assistant proposes in chat. |

## src/hooks/gestures — 6 файлов, 1097 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useDragToScroll.ts` | 233 | 2 | DragToScrollOptions, useDragToScroll | Mouse grab-to-scroll with a click threshold and Apple-style flick momentum. |
| `usePhotoPager.ts` | 321 | 2 | PhotoPagerOptions, usePhotoPager | One-finger deck for the full-screen viewer: pager, pinch, pan, swipe to close. |
| `usePointerDnd.ts` | 245 | 5 | DragItemPayload, UsePointerDndOptions, PointerDndState, usePointerDnd | Pointer-based drag and drop: one live gesture, hover zones, payload on drop. |
| `usePullToSearch.ts` | 89 | 1 | usePullToSearch | Pull a list past either end to open search, with rubber-band damping. |
| `useSheetDrag.ts` | 158 | 1 | useSheetDrag | Drag-to-dismiss for a one-detent sheet, transforms written straight to the co… |
| `useSwipeGesture.ts` | 51 | 2 | SwipeGestureOptions, useSwipeGesture | Left/right swipe detection with a threshold and axis lock, for phone rows. |

## src/hooks/layout — 5 файлов, 287 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useComposerInset.ts` | 39 | 2 | useComposerInset | Publishes the composer dock's live height as --composer-inset for the feed. |
| `useEditorPaneRect.ts` | 59 | 1 | EditorPaneRect, useEditorPaneRect | Measures the dockview pane a note opened from, before paint, and follows resi… |
| `useFlipLayout.ts` | 97 | 2 | useFlipLayout | FLIP motion for a list: moved cards glide, one new card lands, scroll stays s… |
| `useIsMobile.ts` | 36 | 2 | useIsMobile | Tracks whether the viewport sits below the mobile breakpoint, on load and res… |
| `useVisualViewportHeight.ts` | 56 | 1 | useVisualViewportHeight | Writes the visual viewport height to --vvh, so the shell shrinks with the key… |

## src/hooks/media — 3 файлов, 354 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAttachmentSrc.ts` | 61 | 11 | AttachmentSrcs, AttachmentSources, useAttachmentSrcs, useAttachmentSrc | Resolves attachment ids to object URLs on demand, keeping media bytes out of … |
| `useAudioAnalyser.ts` | 89 | 1 | useAudioAnalyser | Owns the one Web Audio graph per audio element, feeding the spectrum orb. |
| `useComposerMedia.ts` | 204 | 1 | UseComposerMediaOptions, useComposerMedia | Composer's record controls: hold or lock, audio/video switch, finish and send. |

## src/hooks/ui — 3 файлов, 271 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useGlobalHotkeys.ts` | 55 | 1 | useGlobalHotkeys | Routes keydown through the APP_COMMANDS catalogue and the top-layer Escape. |
| `useLayerStack.ts` | 123 | 1 | AppLayer, useLayerStack | LIFO dismiss stack shared by Escape and Android/browser back, synced to histo… |
| `usePresence.ts` | 93 | 29 | usePresence | Keeps a surface in the DOM through its exit transition, so CSS can finish it. |

## src/lib — 8 файлов, 2327 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `activityStats.ts` | 166 | 3 | ActivityDay, ActivitySummary, pluralRu, dateKey, summarizeActivity | Turns the vault's own timestamps into a GitHub-style year of activity. |
| `backupService.ts` | 606 | 1 | SlagManifest, BackupService, backupService, DEFAULT_BACKUP_SETTINGS | Vault snapshots: pack a zip, list what is there, restore one, drop old ones. |
| `commands.ts` | 279 | 3 | CommandCategory, AppCommandContext, AppCommand, isMac, formatShortcut, +3 | ponytail: central command & hotkey engine for SLAG v2 without external depend… |
| `memory.ts` | 368 | 6 | MEMORY_LIMIT, MEMORY_PROMPT_LIMIT, MEMORY_TAG_PROMPT_LIMIT, MEMORY_KINDS, MEMORY_KIND_LABEL, +14 | The assistant's own memory: what it knows about the person, how it ages, how … |
| `motion.ts` | 196 | 9 | MotionToken, MotionEase, prefersReducedMotion, motionMs, motionEase, +7 | Reads the CSS motion tokens as numbers, so JS animation timing matches theme.… |
| `navigation.ts` | 13 | 6 | navigatePage | Единственная точка перехода между страницами приложения (?page=…). |
| `notify.ts` | 405 | 2 | DEFAULT_NOTIFY_PREFS, resolveReminder, getNotifyRoutes, saveNotifyRoutes, getNotifyPrefs, +10 | Delayed reminders: arm them on the relay, toast them locally when nothing els… |
| `searchService.ts` | 294 | 4 | preloadSearchEngine, getSearchableAttachmentText, RU_ENDINGS, RU_STOPWORDS, initSearchIndex, +1 | Orama lives in its own lazy chunk (~76 kB, 25 kB gzip). On the 1000-note prob… |

## src/lib/ai — 28 файлов, 5049 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `actionParser.ts` | 376 | 3 | cleanSnippetText, extractActionBlock | Turns the model's reply into typed actions, tolerating fences, chatter and br… |
| `adapters/anthropicAdapter.ts` | 176 | 1 | AnthropicMessagesAdapter | Speaks the Anthropic Messages protocol: tools, tool results and reasoning blo… |
| `adapters/errorMessage.ts` | 19 | 3 | extractErrorMessage | One answer to "what did the provider actually say". |
| `adapters/openAiAdapter.ts` | 210 | 1 | OpenAiChatAdapter | Speaks the OpenAI chat-completions protocol, including tool calls and hosted … |
| `adapters/openAiResponsesAdapter.ts` | 211 | 2 | OpenAiResponsesAdapter | Speaks the OpenAI Responses protocol that KIE and DeepSeek endpoints expect. |
| `aiClient.ts` | 106 | 2 | AiResolvedTarget, PromptRequest, PromptResult, resolveAiTarget, parseJsonContent, +5 | Sends one assistant turn through whichever connection the chat role resolves … |
| `aiService.ts` | 414 | 7 | CategorizeResult, TriageSuggestion, TriageProgress, TriageProgressCallback, categorizeDraft, +4 | App-facing AI calls: categorize a note, triage a folder, send a chat turn. |
| `appGuide.ts` | 243 | 2 | APP_GUIDE_TOPICS, AppGuideTopic, getAppGuideContent | ponytail: curated topic catalog for in-app assistant UI navigation & feature … |
| `connections/endpoints.ts` | 87 | 4 | WireTarget, resolveKieEndpoint, resolveWire, resolveTranscriptionEndpoint, resolveGeminiGenerateEndpoint | Endpoint and adapter for one connection + model. The only place that knows a … |
| `connections/presets.ts` | 129 | 8 | ProviderPreset, PROVIDER_PRESETS, connectionCapabilities, connectionSupports, presetFor, +3 | The provider catalogue: one table saying what each kind of connection can do. |
| `connections/resolve.ts` | 142 | 5 | ResolvedAiTarget, RelayAccess, isSubscriptionMode, resolveRelayAccess, resolveRoleConnection, +9 | Who serves each role: the subscription relay, or a ready BYOK connection. |
| `connections/settings.ts` | 240 | 6 | DEFAULT_AI_SETTINGS, isConnectionReady, isConnectionReadyFor, normalizeAiSettings, loadAiSettings | Default settings, readiness rules and the one legacy → connections migration. |
| `fallback/agenda.ts` | 82 | 1 | calendarAgenda | Agenda intent: what is scheduled and overdue for a given day. |
| `fallback/decomposition.ts` | 183 | 1 | splitNote, decomposeTask | Decomposition intents: split a note into tasks and break a task into subtasks. |
| `fallback/dialog.ts` | 131 | 1 | contextualLink, refuseDelete, metaTalk, greetingHelp, shortNoise | Conversational intents: a link from context, deletion refusal, meta talk, gre… |
| `fallback/history.ts` | 35 | 3 | WikiLinkMatch, findItemsByWikiLinks, findItemByWikiLinks, findRecentMessage | Lookups over the chat history: wiki links and recent assistant messages. |
| `fallback/index.ts` | 41 | 1 | runLocalFallbackAgent | Offline intent chain: handlers run in priority order, the first non-null resu… |
| `fallback/intentContext.ts` | 58 | 6 | IntentText, readIntentText, hasPriorityIntent, hasStatusIntent, hasCreateIntent, +1 | Message normalization and intent flags shared by the fallback handlers. |
| `fallback/notes.ts` | 222 | 1 | appendToNote, refineDraft, createRecord | Notes and drafts: appending to a note, refining a draft, creating a record. |
| `fallback/search.ts` | 116 | 1 | filterFeed, vaultStats, searchNotes | Search, feed filtering and vault stats intents. |
| `fallback/tasks.ts` | 400 | 1 | changeTaskParams, rescheduleTasks | Task intents: priority/status changes and rescheduling, single and batch. |
| `fallback/types.ts` | 17 | 9 | LocalFallbackParams, FallbackIntentHandler | Types shared by the offline fallback intent handlers. |
| `orchestrator.ts` | 419 | 1 | AssistantOrchestrator, assistantOrchestrator, resolveKieEndpoint, resolveAiTarget, extractActionBlock, +3 | Runs the assistant loop: prompt, model turn, local tools, until the reply is … |
| `prompt.ts` | 184 | 1 | buildSystemPrompt | Composes the assistant system prompt: today's tasks, folder context and tone … |
| `tags.ts` | 20 | 2 | TagStyle, isStopTag, formatTag | Tag spelling rules shared by note triage and assistant memory: one dictionary… |
| `toolDefinitions.ts` | 201 | 1 | getCanonicalTools | Declares the tool schemas once, so every protocol adapter sends the same set. |
| `tools.ts` | 512 | 1 | createLocalToolExecutor | The tools the assistant may call: search notes, read one, and report on the v… |
| `types.ts` | 75 | 16 | AssistantToolDefinition, AdapterTurnHistoryItem, LlmAdapterTurnRequest, LlmAdapterTurnResponse, LlmProtocolAdapter, +2 | The contract between the assistant loop and a protocol adapter: request, repl… |

## src/lib/logger — 2 файлов, 655 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `logger.ts` | 590 | 52 | LogListener, logger | The log: levels, scopes, listeners, the buffer, retention and persistence. Wh… |
| `logRedaction.ts` | 65 | 1 | maskSensitiveString, sanitizeForLog | Masking secrets in log messages and payloads; the one place that knows what a… |

## src/lib/media — 16 файлов, 1652 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `audioHelper.ts` | 187 | 10 | AudioTrack, AudioScopeMode, AudioTypeFilter, detectAudioFormat, splitAudioName, +6 | Builds the playable audio library from note attachments: format, duration, co… |
| `audioSpectrum.ts` | 439 | 3 | OrbFeatures, ORB_SILENCE, ORB_FFT_SIZE, createSpectrumReader | Features for the liquid orb. |
| `blobToDataUrl.ts` | 16 | 3 | blobToDataUrl | A blob as a `data:` URL. |
| `byteCodec.ts` | 17 | 4 | bytesToBase64, base64ToBytes, toArrayBuffer | Bytes to base64 and back without a Buffer, for crypto and file payloads in th… |
| `deviceGallery.ts` | 39 | 1 | getGalleryAccess, requestGalleryAccess, listDeviceMedia, DeviceMediaItem, DeviceMediaKind | Lists photos and videos from the Android media store, which the webview canno… |
| `enrichment/dispatch.ts` | 299 | 4 | canEnrichAttachments, enrichAttachment, enrichItemAttachments | Picks a transport per attachment type, tries the role's connection first, the… |
| `enrichment/gemini.ts` | 60 | 1 | analyzeImageGemini, transcribeAudioGemini | Native Gemini generateContent: the only transport that reads audio inline ins… |
| `enrichment/http.ts` | 27 | 4 | ENRICH_TIMEOUT_MS, enrichFetch, dataUrlToBlob, dataUrlToText | One deadline for every provider call and the data-URL plumbing they all need. |
| `enrichment/openAi.ts` | 98 | 1 | analyzeImageOpenAi, transcribeAudioOpenAi | OpenAI-compatible transports: chat-completions for images, multipart for spee… |
| `enrichment/relay.ts` | 30 | 1 | callRelayMedia | Subscription media: the relay owns the provider keys, the client only carries… |
| `enrichment/text.ts` | 71 | 5 | extractFocalContext, buildImageInstruction, buildFileInstruction, parseEnrichmentReply, summarizeTranscript | Instructions sent to vision/audio/file models, and the parsing of their repli… |
| `enrichment/types.ts` | 6 | 5 | EnrichmentResult | What every enrichment transport returns, regardless of protocol. |
| `fileDropHelper.ts` | 115 | 4 | MAX_ATTACHMENT_BYTES, attachmentType, attachmentFromDataUrl, processFileListToAttachments | What the storage layer takes inline without turning into a memory problem. |
| `folderBrowser.ts` | 128 | 4 | listFolders, pickFolder, listFolderEntries, pickFilesFromSystem, readEntryBytes, +3 | Folders the person already granted; the grant survives restarts and app updat… |
| `imageCodec.ts` | 91 | 3 | EncodedImage, ImageEncodeOptions, STORED_IMAGE_MAX_DIM, STORED_IMAGE_QUALITY, UNCOMPRESSIBLE_IMAGE_TYPES, +3 | Shrinks and re-encodes images on a canvas before storage, sync or sending to … |
| `mediaEvents.ts` | 29 | 3 | bindMediaEvents | One list of media-element events, bound and unbound in one move. A player that |

## src/lib/platform — 6 файлов, 1104 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `encryptedLocalStore.ts` | 137 | 1 | ENCRYPTED_SECRET_PREFIX, getLocalSecret, setLocalSecret, deleteLocalSecret | Web/Android secret store: AES-GCM ciphertext in localStorage, non-extractable… |
| `folderOpener.ts` | 73 | 5 | OpenFolderResult, openAppFolder | Opens logs, notes or backups in the OS file manager, with a toast when no she… |
| `openExternal.ts` | 19 | 1 | openExternalUrl | Opens a link in the system browser. Telegram deep links are the reason this e… |
| `platform.ts` | 87 | 4 | isTauriEnvironment, PlatformInfo, getPlatformInfo, setupSystemHotkey, removeSystemHotkey | Reports the desktop OS, session type and hotkey backend so settings can adapt. |
| `secretStore.ts` | 394 | 5 | SECRET_KEYS, SecretStoreMode, SecretBackend, SecretStoreUnavailableError, SecretMigrationError, +7 | One place for sync secrets at rest. Desktop uses the OS keychain, web/Android… |
| `windowControls.ts` | 394 | 13 | isMobilePlatform, isDesktopApp, isPrimaryWindow, minimizeWindow, toggleMaximizeWindow, +15 | Window chrome and platform checks: main window, minimize, maximize, desktop o… |

## src/lib/storage — 13 файлов, 3094 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentData.ts` | 21 | 3 | stripAttachmentList, stripAttachmentData | Attachments as they belong in the localStorage index: metadata only. |
| `attachments.ts` | 235 | 3 | AttachmentStore | Stores attachment bytes on disk and in IndexedDB, handing the UI blob URLs in… |
| `browserPort.ts` | 30 | 1 | browserVaultPort | The app's implementation of the vault port: one adapter over StorageService, … |
| `folderStore.ts` | 171 | 1 | FolderStoreHost, folderStorageKey, readFolders, writeFolder, renameFolderTree, +2 | Writing folders: save, rename with the note cascade, describe, delete and re-… |
| `index.ts` | 741 | 38 | StorageChangeEvent, StorageChangeListener, StorageService, storage, VaultStats, +4 | The one door to the vault: notes, cache and change events, and delegation to … |
| `indexedDb.ts` | 147 | 3 | idbSaveAttachment, idbGetAttachment, idbGetAllAttachments, StoredSnapshotRecord, idbSaveSnapshot, +3 | IndexedDB blob store for attachment bytes and backup snapshots, keyed by id. |
| `port.ts` | 62 | 8 | ChangeOrigin, SyncedVaultData, VaultPort, setVaultPort, vault | The slice of the vault that sync may touch. The app backs it with StorageServ… |
| `settingsStore.ts` | 478 | 1 | SettingsStoreHost, draftsStorageKey, workspaceStateStorageKey, flushDraftWrites, installDraftFlushGuards, +18 | Small settings and drafts: which localStorage keys are kept and how they are … |
| `trashStore.ts` | 81 | 1 | TrashStoreHost, trashStorageKey, readTrash, trashItem, recoverFromTrash | Keeps deleted notes in a per-vault trash, so restore and purge happen before … |
| `usage.ts` | 310 | 1 | MediaKind, LocalUsageGroup, LocalUsage, MediaTypeUsage, HeavyAttachment, +12 | What the store actually occupies: localStorage by key group, media by type, s… |
| `vaultFiles.ts` | 508 | 1 | VaultFilesDeps, VaultFiles | The vault as files on disk: where they live, how a name is claimed, how a not… |
| `vaultRegistry.ts` | 199 | 1 | VaultRegistryHost, initCurrentVault, getVaults, saveVaultMeta, ensureVaultSyncId, +4 | Which vault the app is looking at: the registry kept in localStorage, and the… |
| `vaultTransfer.ts` | 111 | 1 | VaultSnapshot, buildVaultExportJson, VaultImportIo, VaultImportPayload, importVaultPayload, +1 | The vault interchange format: export, import and backup JSON, apart from pers… |

## src/lib/sync — 24 файлов, 6407 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `account.ts` | 632 | 25 | accountClient, generateMnemonic, AccountDevice, AccountDeviceInput, AccountInfo, +14 | The sync account: session and sign-in, what the plan is, and the device ident… |
| `accountCrypto.ts` | 266 | 6 | AccountIdentity, generateAccountIdentity, signDeviceChallenge, getOrCreateDeviceIdentity, renameStoredDevice, +3 | Derives account and device keys, and wraps one vault key for one specific dev… |
| `accountTypes.ts` | 152 | 11 | AccountInfo, AccountDevice, VaultGrant, AccountVault, VaultInvitation, +13 | Shapes of the relay account API: plans, devices, vault grants and invitations. |
| `applyBundle.ts` | 359 | 1 | persistIncomingBundle | What a bundle from the relay actually does to the vault: tombstones, staged |
| `attachmentSignature.ts` | 7 | 2 | attachmentSignature | Cheap identity for an attachment: name plus size, enough to spot a stale copy. |
| `bip39Words.ts` | 2052 | 1 | BIP39_WORDS | Standard BIP-39 English wordlist (2048 words) |
| `crypto.ts` | 181 | 13 | generateMnemonic, validateMnemonic, deriveVaultKey, deriveRoomId, encryptBundle, +5 | Generates a cryptographically secure 12-word recovery seed phrase |
| `deviceAdmin.ts` | 61 | 1 | DeviceAdminHost, applyAccountDevices, addTrustedDevice, setDeviceAllowedVaults, removeTrustedDevice, +2 | Who may read this vault: the trusted-device list mirrored into the sync confi… |
| `devices.ts` | 221 | 3 | normalizeTrustedDevice, touchDeviceLastSeen, normalizeTrustedDevicesFromAccount, computeSubscription, createDefaultDeviceName, +7 | Normalizes device records from the account and derives the subscription shown… |
| `entities/registry.ts` | 36 | 1 | createSyncOpFromStorageEvent | Translates a storage change into the sync operation the relay understands. |
| `entities/types.ts` | 17 | 2 | SyncEntityKind, SyncAction, SyncOperation | The sync vocabulary: which entities travel, which actions exist, what one op … |
| `index.ts` | 6 | 3 | * from ./types, * from ./crypto, * from ./pairing, * from ./syncEngine | Barrel: re-exports the sync protocol, crypto, pairing and engine for lib/sync… |
| `localBookkeeping.ts` | 96 | 3 | SyncScope, stateHashKey, syncedIdsKey, tombstonesKey, sentHashesKey, +8 | What this device sent, knows and deleted, so a push stays a diff instead of a… |
| `outbox/outbox.ts` | 59 | 1 | Outbox | Queues unsent sync operations per vault, compacting repeats of the same entit… |
| `pairing.ts` | 170 | 2 | createPairingSession, claimPairingSession, approvePairingSession, approveAccountPairingSession, rejectPairingSession, +2 | Creates a new 5-minute pairing session with a 6-digit PIN on the relay server |
| `presence.ts` | 28 | 1 | DevicePresence, devicePresence | Who is actually on the line right now. The relay touches a device's `lastSeen… |
| `pushBundle.ts` | 307 | 1 | pushLocalChanges | Packing the local state into an outgoing bundle: what is dirty, what was alre… |
| `syncConfig.ts` | 167 | 2 | SyncConfigHost, computeSubscription, loadConfig, saveConfig, authHeaders, +3 | Where the sync config lives per vault, how requests are authorized, how a see… |
| `syncEngine.ts` | 929 | 18 | PendingPush, SyncEngine, syncEngine, storage, accountClient | Owns sync: config, push of local changes, apply of incoming bundles, status r… |
| `syncSocket.ts` | 41 | 1 | SyncSocketHost, connectSocket, handleIncoming, acknowledgeBundle | The live socket: open it for the current room, accept a frame, acknowledge a … |
| `transport.ts` | 213 | 2 | TransportCallbacks, TransportOptions, SendAckOptions, SyncTransport | The websocket link to the relay: connect, heartbeat, reconnect, route incomin… |
| `twoFactorAuth.ts` | 198 | 1 | TotpConfig, WebAuthnConfig, TwoFactorState, base32Encode, base32Decode, +6 | Two-Factor Authentication (2FA) for Zero-Knowledge Vaults |
| `types.ts` | 124 | 23 | DeviceSyncMode, DeviceProfile, SyncConnectionState, SubscriptionInfo, SyncStatus, +8 | Shared sync types: device profile, connection state, subscription and status … |
| `vaultSharing.ts` | 85 | 4 | getLocalVaultId, shareVaultWithDevice, acceptSharedVault, installSharedVault | Hands a vault key to another device and accepts one, so the vault opens on bo… |

## src/lib/tasks — 2 файлов, 144 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `taskCompletion.ts` | 35 | 1 | applyTaskCompletion | keep every local status entry point consistent, without applying transitions … |
| `taskUtils.ts` | 109 | 14 | baseTaskId, parseSubtasksFromContent, toggleCheckboxInContent, setAllCheckboxesInContent, migrateLegacySubtasksToContent, +1 | The calendar projects a recurring task into every occurrence as |

## src/lib/text — 4 файлов, 354 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `chatMarkdown.ts` | 72 | 1 | ChatSegment, splitTaskBlocks | Splits an assistant reply into markdown and fenced task blocks the chat rende… |
| `diffUtils.ts` | 266 | 1 | WordChunk, SideBySideDiffRow, DiffResult, MetadataDiffItem, computeLineWordDiff, +2 | Line and word diffs for the note history view, with both sides numbered. |
| `formatBytes.ts` | 9 | 6 | formatBytes | Formats a byte count for UI labels, and stays silent when the size is unknown. |
| `shortId.ts` | 7 | 6 | shortId | An id cut down for reading: the head, an ellipsis, the tail. |

## src/lib/time — 4 файлов, 961 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendarLayout.ts` | 139 | 6 | LayoutPositionedTask, TimedBlockBox, timedBlockBox, computeAntiOverlapLayout | Day-calendar geometry: which column a timed task takes and how tall its block… |
| `dateUtils.ts` | 126 | 24 | RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS, getISODateString, getTodayIso, getTomorrowIso, +11 | dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2. |
| `recurrenceHelper.ts` | 306 | 5 | RECURRENCE_PRESETS, parseISODateString, getIsoWeekday, formatRecurrenceLabel, computeNextStrictOccurrenceDate, +4 | Recurrence rules: parse, describe and advance a repeating task to its next oc… |
| `todoistTaskParser.ts` | 390 | 11 | ParsedTodoistTask, parseTodoistInput, TaskTimeSlot, getTaskTimeSlot, extractAndStripTags, +1 | Parses Todoist-style quick input into title, due date, tags, priority, durati… |

## src/lib/vault — 11 файлов, 924 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `demoVault.ts` | 238 | 1 | generateDemoItems | Generates a clean, cohesive set of starter demo items across the default fold… |
| `folderItems.ts` | 37 | 3 | itemsInFolder, materialsInFolder | Records that belong to a folder. Inbox is a leaf: it holds only the items that |
| `folderOptions.ts` | 95 | 6 | FolderSelectOption, buildFolderOptions | Turns the flat folder list into the one tree of picker options every menu sha… |
| `folderPaths.ts` | 38 | 3 | sanitizeFolderName, parentPathOf, folderPathForName, folderPathUnder, isFolderPathFree, +2 | Folder names are file names on disk, so the OS-forbidden characters become da… |
| `itemSchema.ts` | 46 | 1 | PropertySchemaItem, ITEM_MUTABLE_PROPERTIES, ITEM_UPDATES_SCHEMA | Single Source of Truth (SSOT) metadata registry for SlagItem mutable fields. |
| `itemUpdates.ts` | 70 | 2 | applyItemUpdates | Applies a partial update to an item without touching storage. |
| `markdownSerializer.ts` | 205 | 5 | serializeItemToMarkdown, parseMarkdownToItem | Serializes a SlagItem into Markdown with YAML Frontmatter (Obsidian-compatibl… |
| `noteFilename.ts` | 35 | 6 | getSafeNoteFilename, withIdSuffix | ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; … |
| `safePath.ts` | 69 | 6 | SafeVaultPathOptions, safeVaultRelativePath, isSafeVaultRelativePath | One answer to "is this path allowed inside the vault": normalizes separators … |
| `stats.ts` | 67 | 2 | VaultStats, collectExistingTags, computeVaultStats | Read-only counters and tag tallies, with the inbox treated as the whole vault. |
| `vaultDisplay.ts` | 24 | 5 | getVaultDisplayName | Names a vault for the UI, adding a short id suffix only when two names collid… |

## src/mcp — 6 файлов, 1305 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 58 | 0 | startMcpServer | Stdio entry point of the MCP server that exposes one vault to external AI cli… |
| `prompts.ts` | 71 | 3 | registerMcpPrompts | MCP prompts that walk an agent through triage, daily planning and review. |
| `resources.ts` | 131 | 3 | registerMcpResources | MCP resources: folder map, pending tasks and notes a client can read without … |
| `tools.ts` | 380 | 3 | registerMcpTools | MCP tools that read and write notes, tasks and folders in a vault over JSON-R… |
| `types.ts` | 83 | 2 | McpVaultConfig, VaultStateData, NoteMatch, SaveNoteSchema, GetNoteSchema, +6 | Zod schemas and vault shapes the MCP tools accept, with their user-facing des… |
| `vault.ts` | 582 | 6 | resolveVaultConfig, McpVault, getSafeNoteFilename | The vault as the MCP server sees it: files on disk, frontmatter, attachments … |

## src/node — 5 файлов, 813 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `cli.ts` | 302 | 1 | CliOptions, parseFlags, runCli | The commands the node answers to. Loaded only after the environment and the s… |
| `env.ts` | 109 | 2 | slagHome, installNodeEnvironment | The browser surfaces the sync core still leans on, backed by files. Installed… |
| `index.ts` | 25 | 0 |  | Entry for the headless node. Everything below it is imported dynamically on p… |
| `secrets.ts` | 53 | 1 | initNodeSecretStore | Secrets at rest for the headless node: one 0600 file. A server has no keychai… |
| `vaultPort.ts` | 324 | 1 | NodeVault | The vault as the headless node sees it: notes are files under `notes/`, every… |

## src/node/stubs — 4 файлов, 62 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `browserPort.ts` | 10 | 0 | browserVaultPort | The headless build never has a browser store: it registers its own VaultPort … |
| `storageSingleton.ts` | 8 | 0 | storage | `syncEngine` re-exports the browser store for the e2e specs. The headless bui… |
| `tauri.ts` | 24 | 0 | isTauri, getCurrentWindow, getCurrentWebviewWindow, listen, invoke | Stubs for the tauri API, swapped in by the headless build. `isTauri()` must a… |
| `tauriFs.ts` | 20 | 0 | BaseDirectory, mkdir, writeTextFile, readDir, remove | Logs on disk go through plugin-fs in the browser build. A server writes them … |

## src/types — 2 файлов, 704 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 524 | 183 | SlagItemType, TaskStatus, SlagItemStatus, SlagItemPriority, SlagAttachment, +65 | The domain, in one place: notes, folders, vaults, attachments, sync and AI se… |
| `slashCommands.ts` | 180 | 3 | SlashCommand, SLASH_COMMANDS, CATEGORY_LABELS | The slash-command palette: trigger, aliases, icon and what each command inser… |
