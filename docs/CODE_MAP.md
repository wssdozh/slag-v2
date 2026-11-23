# CODE_MAP — карта модулей

Сгенерировано `npm run map:code`. Руками не править — перезапишется.
Читай эту карту до того, как грепать: колонка «импортят» показывает,
что модуль реально используется, «что это» — зачем он нужен.

Модулей: **672**, строк: **116905**, зон: **48**.

## Самые длинные файлы

| файл | строк | импортят |
|---|---:|---:|
| `src/lib/sync/bip39Words.ts` | 2052 | 1 |
| `e2e/slag/editor.spec.ts` | 1753 | 0 |
| `src/lib/sync/syncEngine.ts` | 1647 | 28 |
| `src/lib/storage/index.ts` | 1539 | 52 |
| `e2e/slag/views.spec.ts` | 1098 | 0 |
| `src/lib/sync/notes/replica.ts` | 1042 | 1 |
| `src/lib/storage/settingsStore.ts` | 959 | 5 |
| `src/lib/storage/vaultFiles.ts` | 938 | 2 |
| `e2e/slag/feed.spec.ts` | 919 | 0 |
| `e2e/slag/workspace.spec.ts` | 917 | 0 |
| `e2e/mobile.spec.ts` | 899 | 0 |
| `src/mcp/vault.ts` | 811 | 6 |
| `src/context/AppContext.tsx` | 794 | 72 |
| `src/components/Feed/Composer.tsx` | 759 | 4 |
| `src/components/Feed/ItemCard.tsx` | 722 | 1 |

## e2e (playwright) — 152 файлов, 27938 строк

Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:

- `e2e/slag/editor.spec.ts` — 1753
- `e2e/slag/views.spec.ts` — 1098
- `e2e/slag/feed.spec.ts` — 919
- `e2e/slag/workspace.spec.ts` — 917
- `e2e/mobile.spec.ts` — 899
- `e2e/motion.spec.ts` — 570
- `e2e/adversarial_memory_time.spec.ts` — 567
- `e2e/assistant_memory.spec.ts` — 555
- `e2e/admin_panel.spec.ts` — 493
- `e2e/adversarial_memory_contradictions.spec.ts` — 429

## src — 2 файлов, 590 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `App.tsx` | 510 | 1 | App | The app shell: routes, lazy-loaded screens, viewport height and global overla… |
| `main.tsx` | 80 | 0 |  | Boots the React root into #root, in StrictMode, after the settings store, the… |

## src/components — 1 файлов, 56 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `InitialSyncBoundary.tsx` | 56 | 1 | InitialSyncBoundary | Holds the shell until the first sync settles, so nobody is shown half a vault. |

## src/components/Account — 1 файлов, 350 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountCabinet.tsx` | 350 | 1 | AccountCabinet | Full-page account cabinet: sign in, seed phrase, devices and vault sharing. |

## src/components/Admin — 10 файлов, 2653 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AdminPanel.tsx` | 428 | 1 | AdminPanel |  |
| `Charts.tsx` | 335 | 4 | DataPoint, SparklineChart, BarChart, FunnelChart, DistributionGauge | Dependency-free SVG charts — sparkline, bars, donut, funnel — for the admin t… |
| `tabs/AccountsTab.tsx` | 415 | 1 | AccountsTab | Admin accounts tab: search, plan/status filters, per-account actions, devices. |
| `tabs/AiTab.tsx` | 192 | 1 | AiTab | Admin AI tab: gateway status, request/token totals, model split and the call … |
| `tabs/BillingTab.tsx` | 326 | 1 | BillingTab | Admin billing tab: revenue, expiring plans, transactions and manual grants. |
| `tabs/RelayTab.tsx` | 238 | 1 | RelayTab | Admin relay tab: uptime, rooms, storage and the purge/cleanup/vacuum controls. |
| `tabs/RoomMigration.tsx` | 102 | 1 | RoomMigration |  |
| `tabs/SecurityTab.tsx` | 69 | 1 | SecurityTab | Admin security tab: blocked accounts, revoked devices, encryption note, audit… |
| `useAdminActions.ts` | 294 | 1 | GrantSubscriptionInput, AdminActionsDeps, useAdminActions | Admin mutations: plan changes, blocks, device revoke, grants and refunds. |
| `useAdminData.ts` | 254 | 9 | AdminStats, AdminDevice, AdminVault, AdminAccount, BillingStats, +8 | Admin data loader and its API types: stats, accounts, analytics, audit log. |

## src/components/Audio — 9 файлов, 1680 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioCoverArt.tsx` | 158 | 1 | AudioCoverArt | The album art stand-in: a live spectrum orb that settles once playback pauses. |
| `AudioPanel.tsx` | 255 | 2 | AudioPanel | The audio panel: track scope and type filters, transport controls, and the qu… |
| `AudioPlaylistDrawer.tsx` | 266 | 1 | AudioPlaylistDrawer | The play queue drawer: search, type filters, folder scope, and missing-bytes … |
| `liquidOrb.ts` | 422 | 1 | OrbFrame, createOrbRenderer | The canvas orb that breathes with the audio: blobs driven by spectrum feature… |
| `panel/AudioArtwork.tsx` | 71 | 1 | AudioArtwork | Cover tile plus the title parsed out of the file name, including the missing … |
| `panel/AudioScrubber.tsx` | 83 | 1 | AudioScrubber | The seek bar: click or drag anywhere on the track to scrub, time labels at bo… |
| `panel/AudioTransport.tsx` | 169 | 1 | AudioTransport | The transport row: play, skip, speed, shuffle, loop, mute, and the queue togg… |
| `panel/PlaylistDrawer.tsx` | 64 | 1 | PlaylistDrawer | Turns unresolved track sources into the drawer's missing-bytes list and rende… |
| `panel/useAudioPlayback.ts` | 192 | 1 | useAudioPlayback | Binds the session to the panel: url resolution, the queue, and the transport … |

## src/components/Composer — 1 файлов, 103 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `QuickComposerWindow.tsx` | 103 | 1 | QuickComposerWindow | The transparent quick-capture window: hosts the composer and resets between i… |

## src/components/Editor — 13 файлов, 2666 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachmentStrip.tsx` | 110 | 1 | AttachmentStrip |  |
| `EditorToolbar.tsx` | 175 | 1 | EditorToolbar, EditorToolbarProps | Editor toolbar assembly: top row, markdown palette, save/zen actions. |
| `editorToolbarParts.tsx` | 54 | 5 | ITEM_TYPE_OPTIONS, MarkdownDropdown, EditorToolbarProps, EditorTopBarProps, MarkdownPaletteProps | Shared props, options and dropdown state for the editor toolbar halves. |
| `EditorTopBar.tsx` | 41 | 1 | EditorTopBar | Editor top row: back and folder. The record type lives with the metadata, und… |
| `fullscreen/attachmentEmbeds.ts` | 208 | 1 | AttachmentEmbedDeps, syncAttachmentEmbedDeps, attachmentEmbeds | Inline `![[file]]` embeds in the fullscreen editor: the token is replaced by … |
| `fullscreen/composerDraftOwner.ts` | 29 | 2 | rememberComposerDraft, restoreComposerDraft, consumeComposerDraft | Internal ownership of a composer draft expanded into the editor; never infer … |
| `fullscreen/EditorTagsRow.tsx` | 184 | 1 | EditorTagsRowProps, EditorTagsRow | The editor's tag ribbon: chips you can step into and rename in place. |
| `fullscreen/useEditorAiActions.ts` | 72 | 1 | EditorAiActionsOptions, useEditorAiActions | The editor's two AI actions: file the draft into a folder plus tags, or pick … |
| `fullscreen/useEditorAttachments.ts` | 159 | 1 | EditorAttachmentsOptions, useEditorAttachments | Getting files into the editor: picker, drop, paste, and the `![[file]]` link … |
| `FullscreenEditor.tsx` | 605 | 1 | FullscreenEditor | The focused editor surface: CodeMirror wiring, hotkeys and the sheet's chrome. |
| `MarkdownPalette.tsx` | 259 | 1 | MarkdownPalette | Markdown utilities: history, styles, lists, inline formatting, links, attachm… |
| `MobileEditorBar.tsx` | 328 | 1 | MobileEditorBarProps, MobileEditorBar | The phone formatting bar: style, list and AI popovers above a single save but… |
| `useFullscreenDraft.ts` | 442 | 1 | UseFullscreenDraftOptions, UseFullscreenDraftReturn, useFullscreenDraft | The editor's draft: every editable field, dirty tracking, autosave and the sa… |

## src/components/Feed — 54 файлов, 7831 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ActiveFilterBadges.tsx` | 141 | 2 | ActiveFilterBadgesProps, ActiveFilterBadges | The removable chips for whatever narrows the feed: type, tag, folder, pinned. |
| `assistant/AssistantActionCard.tsx` | 371 | 1 | AssistantActionCard | The confirmation card for an AI action: what it will do, a diff, apply or dis… |
| `assistant/AssistantBanner.tsx` | 45 | 1 | AssistantBanner | Chat header strip: which folder the assistant is looking at, and clearing the… |
| `assistant/AssistantComposer.tsx` | 144 | 1 | AssistantComposer | The assistant's input row: model picker, send, and a nudge to connect when no… |
| `assistant/AssistantMessages.tsx` | 218 | 1 | AssistantMessages | The thread: empty-state prompts, message bubbles, tool traces, and scroll to … |
| `assistant/AssistantReasoning.tsx` | 39 | 1 | AssistantReasoning | Collapsible reasoning trace under a reply, with how long the model spent on i… |
| `assistant/AssistantSearchResults.tsx` | 104 | 1 | AssistantSearchResult, AssistantSearchResults | The search block of a reply: count, expand into the list, open a note or show… |
| `assistant/AssistantTextBubble.tsx` | 48 | 1 | AssistantTextBubble | One chat bubble: markdown with embedded task blocks split out of the same tex… |
| `assistant/AssistantToolCalls.tsx` | 28 | 1 | AssistantToolCalls | The mono trace of tool calls a reply made: name plus the query it ran, nothin… |
| `assistant/ChatTaskBlock.tsx` | 53 | 1 | ChatTaskBlock | A task rendered inside a chat reply: title plus checkbox lines, read-only. |
| `AssistantChat.tsx` | 235 | 2 | AssistantChat | The assistant view: thread state, input, expanded traces, and the diff it ope… |
| `BaseComposer.tsx` | 325 | 2 | BaseComposerProps, BaseComposer | The shared composer shell: the text surface, slot layout, and the send plate. |
| `Composer.tsx` | 759 | 4 | ComposerProps, Composer | The create-a-note form: wiring, the autocomplete overlay, and composition of … |
| `composer/ComposerAiButton.tsx` | 31 | 1 | ComposerAiButtonProps, ComposerAiButton | The +AI button: asks the model for folder and tags, spinning while the call r… |
| `composer/ComposerAttachmentStrip.tsx` | 113 | 1 | ComposerAttachmentStripProps, ComposerAttachmentStrip | The tray of what is about to be sent: attachment chips, each removable. |
| `composer/composerDecorations.ts` | 50 | 1 | setComposerHighlights, composerHighlightExtensions | Paints the tokens the parser understood right inside the CodeMirror composer … |
| `composer/ComposerEditorField.tsx` | 155 | 2 | ComposerEditorKeyEvent, ComposerEditorFieldProps, ComposerEditorField | The composer's text surface, rebuilt on the same CodeMirror editor the fullsc… |
| `composer/composerFields.ts` | 138 | 2 | ComposerDismissals, ComposerFieldSources, ComposerFields, resolveComposerFields | Merges what the draft text says with what was picked, skipping dismissed chip… |
| `composer/composerHighlights.ts` | 85 | 4 | ComposerHighlightKind, ComposerHighlight, ComposerHighlightSegment, buildComposerHighlights, segmentText | Where the composer's parsed syntax sits in the first line, and how the mirror… |
| `composer/ComposerRecordButton.tsx` | 45 | 1 | ComposerRecordButtonProps, ComposerRecordButton | The recorder plate that stands in for send on an empty draft: hold, tap to sw… |
| `composer/ComposerReplyBanner.tsx` | 39 | 1 | ComposerReplyBannerProps, ComposerReplyBanner | The reply-to banner above the composer that collapses instead of vanishing. |
| `composer/ComposerTypeSelector.tsx` | 53 | 1 | ComposerTypeSelectorProps, ComposerTypeSelector | The note / task / article switch at the bottom of the composer. |
| `composer/field.ts` | 115 | 6 | FieldSelection, ComposerFieldHandle, textareaFieldHandle, codeMirrorFieldHandle | The composer's text surface, abstracted away from the <textarea> it used to b… |
| `composer/useComposerAiTags.ts` | 70 | 1 | UseComposerAiTagsOptions, useComposerAiTags | +AI in the composer: writes the suggested folder and tags back as @ and # tok… |
| `composer/useComposerAutocomplete.ts` | 354 | 1 | ComposerKeyEvent, UseComposerAutocompleteOptions, useComposerAutocomplete | The composer's suggestions: which trigger is open, what it matches, and apply… |
| `composer/useComposerDraft.ts` | 524 | 1 | ComposerDraftState, UseComposerDraftOptions, reviveReplyTarget, useComposerDraft | The composer draft on disk: restore, autosave, reset, and repairing pre-reply… |
| `composer/useComposerField.ts` | 51 | 1 | ComposerEngine, useComposerField | React wrapper for the field handle: the DOM is read lazily inside callbacks, … |
| `composer/useComposerFiles.ts` | 152 | 1 | useComposerFiles | Files into the composer: picker, drop and paste, with no opinion on titles or… |
| `composer/useComposerSlashCommands.ts` | 141 | 1 | UseComposerSlashCommandsOptions, useComposerSlashCommands | What a `/command` does to the draft: swap the type, set a property, start a r… |
| `composer/useComposerSubmit.ts` | 204 | 1 | UseComposerSubmitOptions, useComposerSubmit | Turning the draft into a record on submit: reply link, files, AI tags, then r… |
| `FeedColumnResizer.tsx` | 92 | 1 | FeedColumnResizer | Drag handles that set the feed's reading width and keep it as a CSS variable. |
| `FeedHeader.tsx` | 127 | 1 | FeedHeaderProps, FeedHeader | The feed's header: folder name and icon, filter badges, sort, materials toggl… |
| `FeedList.tsx` | 599 | 2 | FeedList | The feed: render window, sentinels and the composition of cards; the edges li… |
| `FolderSuggestionMenu.tsx` | 179 | 1 | FolderSuggestionMenu | The `@folder` autocomplete: the folder tree as branch rows, the selected one,… |
| `FolderViewButton.tsx` | 23 | 2 | FolderViewButton |  |
| `item/ItemAttachmentGrid.tsx` | 106 | 2 | AttachmentTile, ItemAttachmentGrid |  |
| `item/itemAttachments.ts` | 85 | 6 | CardShape, AttachmentGroups, AttachmentCounts, groupItemAttachments, attachmentCounts, +3 | How a card's files split by kind, how many slots they get, and where their by… |
| `item/ItemAudioNotes.tsx` | 46 | 0 | ItemAudioNotesProps, ItemAudioNotes | The card's voice notes, a player each: waveform, transcript and the enrichmen… |
| `item/ItemCardActions.tsx` | 61 | 1 | ItemCardActionsProps, ItemCardActions | The card's corner: reply, and the way into the focus editor for an article. |
| `item/ItemFiles.tsx` | 81 | 0 | ItemFilesProps, ItemFiles | File attachments on a card: one download row each, with size and the summary. |
| `item/ItemReplyBanner.tsx` | 48 | 1 | ItemReplyBannerProps, ItemReplyBanner | The quoted line above a reply: jump to what it answers, or say it is gone. |
| `item/ItemSubtasks.tsx` | 83 | 1 | ItemSubtasksProps, ItemSubtasks | A task's subtasks: one counter, one toggleable line each, collapsible. |
| `item/ItemSyncDot.tsx` | 40 | 1 | ItemSyncDot |  |
| `item/ItemVideoNotes.tsx` | 42 | 0 | ItemVideoNotesProps, ItemVideoNotes | Video circle notes on a card: plays in place, the corner opens the full viewe… |
| `ItemCard.tsx` | 722 | 1 | ItemCardProps, ItemCard | One note in the feed: reply swipe, width, OCR/expansion state, and the slots … |
| `list/FeedDateBubble.tsx` | 22 | 2 | FeedDateBubbleProps, FeedDateBubble | The day separator between feed groups: today, yesterday, or a plain date. |
| `list/FeedDropOverlay.tsx` | 30 | 1 | FeedDropOverlayProps, FeedDropOverlay | The dashed frame over the feed while files hover: what dropping them will do. |
| `list/FeedScrollHint.tsx` | 73 | 1 | FeedScrollHintProps, FeedScrollHint | Two floating tips at the feed edges: pull-to-search, and a jump to the newest… |
| `list/FeedTaskSection.tsx` | 33 | 1 | FeedTaskSection |  |
| `list/feedWindow.ts` | 109 | 2 | partitionFeedBySchedule, WINDOW_CHUNK, takeWindow, hasOlderItems, nextWindowSize, +4 | Pure windowing for the feed: how many cards stay mounted and when to grow the… |
| `PinnedBanner.tsx` | 173 | 1 | PinnedBanner | The pinned strip over the feed: cycles this folder's pinned notes and jumps t… |
| `SlashCommandMenu.tsx` | 102 | 1 | SlashCommandMenu | The `/` command list: filtered by the typed query, grouped by category. |
| `SuggestionMenuShell.tsx` | 57 | 4 | SuggestionMenuShell | Shared placement and presence for the suggestion lists, plus keeping the row … |
| `TagSuggestionMenu.tsx` | 68 | 2 | TagMeta, TagSuggestionMenu | The `#tag` suggestions: matching vault tags with usage counts, keyboard selec… |

## src/components/FolderProfile — 8 файлов, 737 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderActionsMenu.tsx` | 73 | 1 | FolderActionsMenuProps, FolderActionsMenu | The one ⋯ menu for a folder: rename, move and delete in every container. |
| `FolderAppearancePicker.tsx` | 42 | 2 | FolderAppearancePicker |  |
| `FolderIconGrid.tsx` | 86 | 1 | FolderIconGridProps, FolderIconGrid | Icon picker grid shared by the desktop popover and the phone sheet. |
| `FolderProfile.tsx` | 110 | 3 | FolderProfileProps, FolderProfile | One folder profile in three containers: dock panel, modal and phone screen. |
| `FolderProfileHeader.tsx` | 195 | 1 | FolderProfileVariant, FolderProfileHeaderProps, FolderProfileHeader | Folder header: name, icon, path, counters and the inline edit controls. |
| `FolderStats.tsx` | 91 | 1 | FolderStatsVariant, FolderStatsProps, FolderStats | The folder's six counters, laid out as rows, an inline strip or a grid. |
| `folderStatsConfig.ts` | 35 | 2 | FolderStatKey, FolderStatDefinition, FOLDER_STATS, recordCountLabel | The single list of folder counters, labels and the Russian record count. |
| `useFolderProfileEdit.ts` | 105 | 2 | FolderProfileEditMode, FolderProfileEditOptions, FolderProfileEdit, useFolderProfileEdit | Inline folder editing: one field at a time, committed through the storage act… |

## src/components/Landing — 1 файлов, 49 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SiteRedirect.tsx` | 49 | 1 | SiteRedirect | `?page=landing` used to be a full marketing page inside the app build. The si… |

## src/components/Logs — 2 файлов, 441 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LogModal.tsx` | 24 | 1 | LogModal | Modal shell for the log viewer: opens from the global hotkey and closes above… |
| `LogViewer.tsx` | 417 | 3 | LogViewer | The log panel: filters by scope and level, copy and clear, docked and modal v… |

## src/components/Media — 9 файлов, 1412 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachSheet.tsx` | 208 | 1 | AttachSheet | The one place that attaches things: device picker on a phone, system dialog o… |
| `DesktopSources.tsx` | 83 | 1 | DesktopSourcesProps, DesktopSources | Desktop's attach shortcuts: images, files and voice, each behind a system dia… |
| `FolderBrowser.tsx` | 144 | 1 | FolderBrowserProps, FolderBrowser | The files tab: folders already granted, their contents, and the system dialog… |
| `MediaGrid.tsx` | 328 | 1 | MediaGridProps, MediaGrid | The device gallery grid: paged cells whose thumbnails decode only as they scr… |
| `MediaPreview.tsx` | 235 | 1 | MediaPreviewProps, MediaPreview | Fullscreen photo and video viewer: paging, chrome that idles away, full bytes… |
| `MobilePicker.tsx` | 115 | 1 | MobilePickerProps, MobilePicker | The phone picker: photo, video, audio and file tabs over one selection, plus … |
| `useDeviceGallery.ts` | 81 | 1 | useDeviceGallery | Paged device gallery rows, with the permission state kept next to the items. |
| `useFolderBrowser.ts` | 91 | 1 | useFolderBrowser | Granted folders and the entries inside one, loaded only while the picker is o… |
| `ViewerVideo.tsx` | 127 | 2 | ViewerVideoProps, ViewerVideo | A clip in the viewer: custom transport that hides with the chrome, and play m… |

## src/components/Mobile — 18 файлов, 2812 строк

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
| `MobileCalendarView.tsx` | 429 | 3 | MobileCalendarView | The phone calendar: agenda and three-day modes, day swipes, and a month picke… |
| `MobileFloatingDock.tsx` | 153 | 1 | MobileFloatingDockProps, MobileFloatingDock | The floating tab dock at the bottom of the phone shell, with its capture butt… |
| `MobileFolderInfoView.tsx` | 70 | 1 | MobileFolderInfoView | Phone folder page: the profile fills the screen and editing happens in place. |
| `MobileFoldersView.tsx` | 353 | 1 | MobileFoldersView | The phone folder screen: header, feed/Kanban/calendar switch, and the pinned … |
| `MobileScreenHeader.tsx` | 93 | 4 | MobileScreenHeaderProps, MobileScreenHeader | The phone screen's top bar: back, title slots, and the status-bar inset. |
| `MobileSettingsView.tsx` | 150 | 1 | MobileSettingsView | The phone settings tab: grouped rows, live sync status, and the vault switche… |
| `MobileShell.tsx` | 117 | 1 | MobileShell | The phone shell: which tab is on screen, and the edge swipe that goes back. |
| `MobileTasksView.tsx` | 271 | 1 | MobileTasksView | The phone tasks tab: status tabs you swipe between, plus the calendar mode. |

## src/components/Modals — 12 файлов, 2511 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `BaseModal.tsx` | 169 | 15 | BaseModalProps, BaseModal | The dialog frame every modal wears: presence, backdrop, header, footer, Escap… |
| `ComposerModal.tsx` | 61 | 1 | ComposerModal | The composer in a dialog: keeps its last options and folder through the exit. |
| `ConfirmDialog.tsx` | 94 | 1 | ConfirmDialog | The app's own yes/no for destructive actions, instead of the platform's confi… |
| `ConflictTextPane.tsx` | 55 | 1 | ConflictTextPane |  |
| `DiffModal.tsx` | 574 | 2 | DiffModalItemEntry, DiffModalProps, DiffModal | What an AI edit would change, before it is applied: the line diff and the acc… |
| `FolderInfoModal.tsx` | 94 | 1 | FolderInfoModal | The folder dialog: its profile, plus triage, a new note, and its tags as filt… |
| `FolderModal.tsx` | 168 | 1 | FolderModal | Creating a folder: name, parent and icon; editing that lives in the folder pr… |
| `FolderMoveModal.tsx` | 108 | 1 | FolderMoveModal | Moving a folder to another parent: a dialog over the profile, not an inline f… |
| `FolderViewModal.tsx` | 158 | 1 | FolderViewModal | The folder's layout is one click away; detailed choices stay on their own pag… |
| `SettingsModal.tsx` | 268 | 1 | SettingsModal | The settings shell: a rail of tabs, the mobile and desktop frames, and the pi… |
| `TriageModal.tsx` | 478 | 1 | TriageModal | AI triage of the inbox: one batch of notes, folders and tags confirmed in a s… |
| `VaultModal.tsx` | 284 | 1 | VaultModal | The vault switcher: choose a store, create one on a backend, or delete one. |

## src/components/RightPanel — 3 файлов, 507 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderInfoPanel.tsx` | 19 | 1 | FolderInfoPanel | Dock-width container for the folder profile, bound to the current folder. |
| `FolderMediaTabs.tsx` | 353 | 1 | FolderMediaTabsProps, FolderMediaTabs | Folder media browser: images, audio, files, links and tags in one tab strip. |
| `useFolderMedia.ts` | 135 | 4 | FolderMediaImage, FolderMediaAudio, FolderMediaFile, FolderMediaData, useFolderMedia | Collects a folder's attachments, links and tags; the bytes stay with the tile… |

## src/components/Search — 1 файлов, 434 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SearchModal.tsx` | 434 | 2 | SearchModal | The ⌘K palette: one query, hits grouped by kind, and keyboard navigation thro… |

## src/components/Settings — 48 файлов, 5645 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountSettingsTab.tsx` | 81 | 1 | AccountSettingsTab | First settings tab: who you are, how much you have done, plan limits and wher… |
| `ActivityHeatmap.tsx` | 123 | 1 | ActivityHeatmap | A year of activity as GitHub draws it: one column per week, one square per da… |
| `ai/ConnectionEditor.tsx` | 95 | 1 | ConnectionEditor | One connection's fields: label, endpoint, key, protocol and the per-role mode… |
| `ai/ConnectionsSection.tsx` | 93 | 1 | ConnectionsSection | The list of connections: a row per provider, expanding into its editor. |
| `ai/RolesSection.tsx` | 55 | 1 | RolesSection | Who does what: answer, vision and speech, each picking one connection. |
| `ai/useAiSettingsForm.ts` | 129 | 1 | AiSettingsForm, useAiSettingsForm | The AI settings form's one state: connections, roles and the flags, with thei… |
| `AiPromptModal.tsx` | 320 | 1 | PromptField, AiPromptModal | One dialog per prompt field: instructions and persona are edited apart, and s… |
| `AiSettingsTab.tsx` | 228 | 1 | AiSettingsTab | Where the model comes from — subscription or your own connections — and what … |
| `devices/DeviceActions.tsx` | 150 | 2 | DeviceName, DeviceRevokeButton, LocalSyncModeGroup, PairDeviceButton, PairDeviceModal | Device row widgets: inline rename, revoke, and the local sync mode picker. |
| `devices/DeviceCard.tsx` | 25 | 1 | DeviceCard | The modal shell that shows one device and the vaults it can reach. |
| `devices/DeviceIcon.tsx` | 26 | 1 | DeviceIcon | The glyph a device row wears: one distinct mark per form factor, never the sa… |
| `devices/DeviceList.tsx` | 98 | 1 | DeviceList | Connected devices: this machine first, then each paired one with its status. |
| `devices/DevicePermissions.tsx` | 63 | 1 | DevicePermissions | Per-device vault access dialog: grant mode and a toggle for each vault. |
| `devices/useDevicePairing.ts` | 320 | 2 | DevicePairingController, useDevicePairing | Pairing controller: host PIN, guest claim, SAS approval and the polling loop. |
| `DevicesSettingsTab.tsx` | 199 | 1 | DevicesSettingsTab | Devices tab: paired machines, per-device vault access, and the pairing flow. |
| `IntegrationsSettingsTab.tsx` | 270 | 1 | IntegrationsSettingsTab | Integrations: the master switch, the list of channels, and one detail screen … |
| `LogsSettingsTab.tsx` | 12 | 1 | LogsSettingsTab | The log viewer, docked inside settings instead of floating over the feed. |
| `MemoryList.tsx` | 102 | 1 | MemoryList | The assistant's memory in settings: what it thinks it knows, and the way to c… |
| `MobileDockSettings.tsx` | 218 | 1 | MobileDockSettings | Edits the phone dock: which tabs appear, in what order, dragged into place. |
| `notifications/accessCopy.ts` | 36 | 2 | DeviceAccessRow, DEVICE_ACCESS_ROWS, accessValue, accessStateLabel, accessActionLabel | The Android permission rows: which grant each row speaks about and the words … |
| `notifications/AssistantGroup.tsx` | 67 | 1 | AssistantGroup | «Ассистент в telegram»: what the bot may answer, and how much of the vault it… |
| `notifications/ChannelGroup.tsx` | 107 | 1 | ChannelGroup | «Канал в telegram»: whether a recipient is linked, and the one code that link… |
| `notifications/ContentGroup.tsx` | 30 | 1 | ContentGroup | «Что приходит»: which reminders reach this device. |
| `notifications/PermissionsGroup.tsx` | 66 | 1 | PermissionsGroup | android only: показ поверх других приложений, будильник на весь экран и систе… |
| `notifications/QuietHoursGroup.tsx` | 88 | 1 | QuietHoursGroup | «Тихие часы»: a mode that holds reminders back, and the window it holds them … |
| `notifications/SystemGroup.tsx` | 26 | 1 | SystemGroup | системные уведомления устройства: одна кнопка проверки. |
| `NotificationsSettingsTab.tsx` | 59 | 1 | NotificationsSettingsTab | уведомления этого устройства: что приходит, режим «не беспокоить» и проверка … |
| `NotifyInviteModal.tsx` | 154 | 1 | NotifyInviteModal | «Ждём подтверждения»: one live code, one progress line, and a link that actua… |
| `ProfileAvatar.tsx` | 31 | 1 | ProfileAvatar | The one round identity chip: the synced photo when there is one, initials oth… |
| `ProfileCard.tsx` | 195 | 2 | ProfileCard | The identity block: round photo with its edit menu, name and plan, the same o… |
| `SecretKeyField.tsx` | 49 | 1 | SecretKeyField | One-line secret input with a per-field reveal toggle and no autocorrect. |
| `SettingsUI.tsx` | 306 | 30 | SettingsGroup, SettingsDivider, SettingsRow, SettingsSwitch, SettingsSelect, +2 | Settings' shared building blocks: group cards, rows, dividers, switches, sele… |
| `ShortcutsSettingsTab.tsx` | 101 | 1 | ShortcutsSettingsTab | The hotkey catalogue, rendered from the same table the keydown handler reads. |
| `SyncSettingsTab.tsx` | 221 | 1 | SyncSettingsTab | The sync channel: status, server address, schedule; account and devices sit n… |
| `UiSettingsTab.tsx` | 102 | 1 | UiSettingsTab | How it looks: accent, fonts, density, panel widths and the mobile dock. |
| `UpdatesSettingsTab.tsx` | 326 | 1 | UpdatesSettingsTab | The "Обновления" tab: what is installed, what is on GitHub, and the one butto… |
| `vault/BackupSection.tsx` | 129 | 1 | BackupSection | «бэкапы»: the daily autobackup setting and the restore points it produces. |
| `vault/integrity/IntegrityFindingCard.tsx` | 60 | 1 | IntegrityFindingCard | Карточка одной находки сканера — вынесена, чтобы панель не распухала. |
| `vault/integrity/IntegrityPanel.tsx` | 275 | 1 | IntegrityPanelProps, IntegrityPanel | Панель «состояние хранилища»: что знает сервер и что видит диск — двумя блока… |
| `vault/integrity/IntegritySection.tsx` | 36 | 1 | IntegritySection | «состояние хранилища»: сверка по манифесту и уборка того, что можно убрать бе… |
| `vault/integrity/severityLabel.ts` | 23 | 1 | severityLabel | Подписи и цвета важности находок. Цвета — из токенов темы, никаких выдуманных… |
| `vault/sections.ts` | 11 | 2 | VaultSection, VAULT_SECTIONS | The three blocks of the vault tab, named once: the rail shows them as nested … |
| `vault/StorageSection.tsx` | 33 | 1 | StorageSection | «хранилище»: how much the store occupies and where its folders live on disk. |
| `vault/StorageUsageParts.tsx` | 85 | 1 | UsageRing, UsageLine, EmptyLine | The ring and the one-line rows of «занятое место»: geometry only, the numbers… |
| `vault/StorageUsageSection.tsx` | 227 | 1 | StorageUsageSection | "Занятое место": the whole store's footprint — local keys, media, snapshots a… |
| `vault/TransferSection.tsx` | 99 | 2 | TransferSection | «перенос»: the vault leaves as a ZIP or JSON and comes back through the same … |
| `vault/usageTone.ts` | 20 | 2 | SEGMENT_TONE, toneOf, MEDIA_SEGMENT_IDS | Tones for the storage ring: one token pair per sector, no colour invented in … |
| `VaultSettingsTab.tsx` | 76 | 1 | VaultSettingsTab | The vault tab: the disk, the backups, the way out. On a desktop the rail owns… |

## src/components/Sidebar — 4 файлов, 649 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderTree.tsx` | 357 | 1 | FolderTree | Nested folder tree in the sidebar: expand, select, and drag — a note lands in… |
| `Sidebar.tsx` | 151 | 1 | Sidebar | Left rail: vault switcher, folder tree, inbox, sync state and settings shortc… |
| `syncGlyph.ts` | 29 | 1 | syncGlyph | Keep the rail quiet during background traffic; comparison details belong in t… |
| `SyncStatusButton.tsx` | 112 | 2 | SyncStatusButton |  |

## src/components/UI — 38 файлов, 6803 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AnchoredPopover.tsx` | 95 | 5 | AnchoredPopover | Keep an anchored surface in the visible window, outside any scrolling parent. |
| `AudioPlayer.tsx` | 359 | 5 | AudioPlayer | Plays a note's audio: waveform scrub, speed, transcript and on-demand enrichm… |
| `AudioRecorder.tsx` | 209 | 2 | AudioRecorder | Records a voice memo in a bottom bar, previews its length, then hands the cli… |
| `Button.tsx` | 57 | 9 | ButtonProps, Button | The kit's one button: four tones, three sizes, optional icon, ref-forwarded. |
| `Checkbox.tsx` | 75 | 2 | CheckboxProps, Checkbox | A checkbox with a label and hint, toggled by click or keyboard for settings r… |
| `ContextMenu.tsx` | 357 | 1 | ContextMenu | Right-click menu for items, folders and feed rows: sections, submenus and hov… |
| `DatePickerPopover.tsx` | 306 | 1 | DatePickerPopoverProps, DatePickerPopover | Picks a due date: month grid, quick today/tomorrow/next-week, and a clear act… |
| `EmptyState.tsx` | 32 | 2 | EmptyStateProps, EmptyState | The shared blank slate: an icon, one line of why it is empty, an optional act… |
| `IconButton.tsx` | 51 | 10 | IconButtonProps, IconButton | Square icon-only button in three sizes and three tones, for dense toolbars. |
| `icons/Icon.tsx` | 109 | 150 | IconSize, IconVariant, IconTone, IconProps, Icon | One icon element for the whole app: the glyph comes from the config, the size… |
| `icons/icons.ts` | 569 | 18 | GlyphComponent, Glyph, IconEntry, ICONS, IconName, +4 | The one icon config: a semantic name per glyph, grouped by meaning. |
| `ImageLightbox.tsx` | 398 | 3 | ImageLightboxProps, ImageLightbox, LightboxImage | The feed's media viewer: swipeable photos and clips, keyboard nav, OCR side p… |
| `InfoHint.tsx` | 91 | 2 | HintBubble, InfoHintProps, InfoHint | One question mark for every explanation in the app. |
| `LightboxTextPanel.tsx` | 151 | 1 | LightboxTextPanelProps, LightboxTextPanel | OCR results beside a photo in the lightbox, with copy and retry when the pass… |
| `MarkdownRenderer.tsx` | 389 | 4 | MarkdownAttachmentSrcs, MarkdownRenderer | Renders markdown with GFM, Obsidian [[wiki links]] as in-app jumps and ![[fil… |
| `menu/feedMenuSections.tsx` | 83 | 1 | FeedMenuSectionsProps, FeedMenuSections | Feed right-click entries: the three create actions plus folder and search jum… |
| `menu/folderMenuSections.tsx` | 89 | 1 | FolderMenuSectionsProps, FolderMenuSections | Folder right-click entries: info, new subfolder, explorer and the guarded del… |
| `menu/itemMenuSections.tsx` | 177 | 1 | ItemMenuSectionsProps, ItemMenuSections | Item right-click entries: reply, pin, type switch, AI split, copy and delete. |
| `menu/MenuSubmenus.tsx` | 230 | 4 | MenuSubmenuName, MenuSubmenusProps, MenuSubmenus | The flyout panels of the context menu: more actions, type switch and explorer. |
| `MenuDropdown.tsx` | 117 | 9 | MenuDropdownProps, MenuDropdown | Anchored popover menu that flips and clamps itself inside the viewport, porta… |
| `MobileActionSheet.tsx` | 177 | 1 | MobileActionSheet | Phone action sheet for a feed item: drag to dismiss, the same actions as righ… |
| `NumberInput.tsx` | 98 | 1 | NumberInputProps, NumberInput | Stepper input: minus/plus buttons and a typed value, clamped to min/max on bl… |
| `PriorityBadge.tsx` | 76 | 4 | TaskPriority, LinearSignalBarsProps, LinearSignalBars | Priority as four Linear-style signal bars, plus the matching badge for task r… |
| `priorityTone.ts` | 47 | 4 | PriorityTone, priorityTone, PRIORITY_TONE_TEXT, PRIORITY_TONE_DOT, PRIORITY_TONE_CHIP | Maps a priority to its one colour family; text, dot and chip classes hang off… |
| `ResponsiveSegmented.tsx` | 243 | 7 | SegmentedOption, ResponsiveSegmentedProps, ResponsiveSegmented | Segmented control that collapses into a dropdown once the row no longer fits. |
| `segmentedVariants.ts` | 56 | 2 | SegmentedVariant, SegmentedStripClasses, SEGMENTED_STRIP_CLASSES | Class presets for the segmented strip, so mobile headers share one geometry. |
| `Select.tsx` | 288 | 10 | SelectOption, SelectProps, Select | The app's own select: grouped options, icons, colours, a portal list and plac… |
| `SendButton.tsx` | 50 | 4 | SendButtonProps, SendButton | The round accent arrow that confirms: send, attach or save, one plate for all… |
| `SheetPanel.tsx` | 441 | 2 | SheetPanelApi, SheetPanelProps, SheetPanel | The bottom-sheet shell: detents, drag-to-fold, velocity-aware release, scroll… |
| `TagChip.tsx` | 81 | 5 | TagChipProps, TagChip | A tag as a chip: clickable to filter, removable while editing, flat or pill. |
| `TaskMetaBar.tsx` | 327 | 2 | TaskMetaBarProps, TaskMetaBar | One row of task controls — status, priority, due date, duration, recurrence —… |
| `TaskStatusMark.tsx` | 50 | 4 | TaskStatusMarkProps, TaskStatusMark | Round task status glyph whose check stroke draws itself when the task is comp… |
| `TimePicker.tsx` | 284 | 1 | TimePickerProps, TimePicker | A time of day: two snap wheels inside the app's dialog frame. |
| `Toast.tsx` | 172 | 1 | ToastContainer | The toast stack: pauses on hover, flicks away, carries one action or an undo. |
| `ToolbarButton.tsx` | 53 | 4 | ToolbarButtonProps, ToolbarButton | Square toolbar button with an active glow, for editor, calendar and view chro… |
| `VideoCirclePlayer.tsx` | 137 | 2 | VideoCirclePlayer | Round Telegram-style video bubble: tap to play, mute toggle, progress ring. |
| `VideoRecorder.tsx` | 227 | 1 | VideoRecorder | Records a video memo with a live preview, then hands the clip to the composer. |
| `WindowControls.tsx` | 52 | 1 | WindowControls | Desktop-only minimize/maximize/close cluster pinned to the window's top-right… |

## src/components/Vault — 1 файлов, 227 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `VaultSwitcherMenu.tsx` | 227 | 3 | VaultSwitcherMenuProps, VaultSwitcherMenu | Vault switcher as a dropdown or phone sheet: pick, create, reveal, delete. |

## src/components/Views — 13 файлов, 2567 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `CalendarDrawer.tsx` | 170 | 1 | CalendarDrawerProps, CalendarDrawer | The calendar's side drawer: overdue and unscheduled tasks, draggable onto the… |
| `CalendarExpandedDayModal.tsx` | 179 | 1 | CalendarExpandedDayModalProps, CalendarExpandedDayModal | A single day blown up: all of its tasks, with add, drag and complete right th… |
| `calendarHelpers.ts` | 67 | 4 | getPriorityBadge, cleanTimeFromTitle, formatDurationBadge | Calendar-only lookups: the priority badge palette, duration label, title clea… |
| `CalendarMonthView.tsx` | 210 | 1 | CalendarMonthViewProps, CalendarMonthView | The month grid: six weeks of cells, the task pills in each, and drop zones wh… |
| `CalendarTaskBlock.tsx` | 339 | 1 | AllDayTaskPillProps, AllDayTaskPill, TimedTaskBlockProps, TimedTaskBlock | The two task shapes on the calendar: the all-day pill and the timed block wit… |
| `CalendarView.tsx` | 575 | 1 | CalendarView | The desktop calendar: month and week grids, drag to reschedule, and the overd… |
| `kanban/KanbanCard.tsx` | 219 | 1 | KanbanCardProps, KanbanCard | A task card on the board: status glyph, key, due date, tags, and its drag han… |
| `kanban/KanbanColumn.tsx` | 120 | 1 | KanbanColumnProps, KanbanColumn | One board column: header with counter, its cards, the drop highlight, an add … |
| `kanban/KanbanMaterialsDock.tsx` | 193 | 1 | KanbanMaterialsDockProps, KanbanMaterialsDock | The materials dock: the folder's notes and articles, searchable, draggable on… |
| `kanban/kanbanModel.ts` | 33 | 5 | KanbanColumnIconType, KanbanColumnConfig, KANBAN_COLUMNS, isOverdue, getTaskKey | Kanban columns config plus the small pure helpers the board and its cards sha… |
| `kanban/KanbanStatusIcon.tsx` | 34 | 2 | KanbanStatusIconProps, KanbanStatusIcon | The Linear-style status glyph shared by a column header and the card's quick … |
| `KanbanBoard.tsx` | 171 | 2 | KanbanBoard | The Kanban board: columns by status, drag between them, and the materials doc… |
| `useCalendarInteractions.ts` | 257 | 1 | DEFAULT_HOUR_HEIGHT, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT, TimelineResizingState, ResizingTaskState, +1 | Timeline state: zooming the hour ruler by dragging it, and stretching a task'… |

## src/components/Workspace — 7 файлов, 1578 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `dockPanelUtils.ts` | 223 | 5 | WORKSPACE_LAYOUT_KEY, wsLog, PANELS_TO_ADD, PANEL_CONSTRAINTS, getPanelMinWidth, +5 | The workspace panel registry: ids, icons, width limits, and layout persistenc… |
| `GroupHeaderActions.tsx` | 87 | 1 | GroupHeaderActions | The `+` menu on a dock group: spawns another panel inside that same group. |
| `useCrossWindowDnd.ts` | 614 | 1 | DropPreviewRect, DropTargetResult, UseCrossWindowDndOptions, useCrossWindowDnd | Dragging a note between workspace panels: the preview rect, the drop target u… |
| `useDockPanels.ts` | 278 | 1 | UseDockPanelsOptions, useDockPanels | Dockview wiring: default layout, panel creation, tab menus, and saving the la… |
| `useWorkspaceTaskFilter.ts` | 50 | 1 | useWorkspaceTaskFilter | Keeps one ephemeral filter addressed to the current visible content panel. |
| `WorkspaceShell.tsx` | 312 | 1 | WorkspaceShellProps, WorkspaceShell | The desktop workspace: the dockview shell holding feed, Kanban, calendar, aud… |
| `workspaceTaskFilterContext.ts` | 14 | 2 | WorkspaceTaskFilterContext, useWorkspaceTaskFilterContext | Shares ephemeral filter state across Dockview's stable panel components. |

## src/config — 9 файлов, 471 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ai.ts` | 87 | 1 | AI_ENDPOINTS, DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT, AI_LIMITS, AI_STOP_TAGS, +1 | Default endpoints, models and size limits for every AI provider the app can r… |
| `index.ts` | 8 | 97 | * from ./storage, * from ./sync, * from ./ai, * from ./search, * from ./ui, +1 | Barrel: re-exports storage, sync, AI, search, UI and typography config as one… |
| `search.ts` | 10 | 1 | SEARCH_LIMITS | Tuning for the Orama index and the palette: result counts, typo tolerance, te… |
| `settingsTabs.ts` | 47 | 4 | SettingsTabId, SettingsTabDefinition, SETTINGS_TABS, settingsTabLabel | Names and orders the settings sections once, so desktop and mobile cannot dri… |
| `site.ts` | 4 | 2 | SITE_URL | Address of the public site, which lives in its own repository: the app build … |
| `storage.ts` | 98 | 9 | DEFAULT_INBOX_FOLDER, STORAGE_KEYS, DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_VAULT_META, +1 | localStorage keys, the default inbox name and the workspace state a new vault… |
| `sync.ts` | 72 | 5 | DEFAULT_SYNC_SERVER_URL, OFFICIAL_SYNC_DOMAINS, SYNC_STORAGE_KEYS, SYNC_INTERVALS, SYNC_ATTACHMENT_MAX_BYTES, +1 | Sync defaults: relay URL, storage keys, retry and debounce timings, bundle si… |
| `typography.ts` | 82 | 3 | FontFamilyOption, FONT_FAMILY_OPTIONS, FontScaleOption, FONT_SCALE_OPTIONS, getFontScaleMultiplier, +1 | Font families and size scales the interface offers, as CSS stacks and multipl… |
| `ui.ts` | 63 | 3 | ACCENT_COLORS, UI_BREAKPOINTS, UI_LAYOUT, UI_DELAYS, UI_GESTURES | Accent presets, not a free picker: one hex repaints the whole accent family in |

## src/context — 2 файлов, 1043 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AppContext.tsx` | 794 | 72 | AppContext, AppProvider, useApp, ToastMessage, AttachSheetRequest, +1 | The single state hub: vault, folders, items, overlays, sync and every action. |
| `appContext.types.ts` | 249 | 9 | ToastMessage, AttachSheetRequest, ContextMenuTarget, FolderViewTarget, FolderViewSection, +1 | The context's public contract and the shapes passed around it, kept out of st… |

## src/context/feed — 1 файлов, 103 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `feedView.ts` | 103 | 4 | FeedViewQuery, hasFeedFilters, selectVisibleItems | Which records the feed shows and in what order — the inbox's three modes as a… |

## src/context/hooks — 14 файлов, 2203 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAppearance.ts` | 87 | 1 | useAppearance | Density, font and accent: presets to prefs and then to CSS variables. |
| `useAppUpdates.ts` | 418 | 1 | useAppUpdates | Owns the app-update state: one silent check after boot, a manual check, the d… |
| `useAssistant.ts` | 113 | 1 | useAssistant | The assistant session: transcript, model choice and one send that never write… |
| `useBackup.ts` | 146 | 1 | useBackup | Backups: scheduled and manual snapshots on disk, restore, and the zip round t… |
| `useFeedView.ts` | 182 | 1 | useFeedView | The feed's view state: folder, mode, filters, sorting, persisted per folder. |
| `useFolderAdmin.ts` | 147 | 1 | useFolderAdmin | A folder's own writes: save, describe, rename, move, delete and the create mo… |
| `useItemWrites.ts` | 225 | 1 | ItemWritesDeps, useItemWrites | Every write to a note: create, save, delete, restore from trash, move, comple… |
| `useLocalDay.ts` | 35 | 1 | useLocalDay | One calendar-day signal for the workspace, independent of task writes. |
| `useMobileNav.ts` | 124 | 1 | DEFAULT_MOBILE_DOCK_TABS, useMobileNav | Which phone surface is showing and how we got there: tabs, push, pop, dock or… |
| `useNotifyArm.ts` | 148 | 1 | useNotifyArm | Keeps the relay armed with the current reminders and fires the local ones. |
| `useOverlays.ts` | 240 | 1 | useOverlays | Everything above the app: modals, lightbox, context menu, toasts, confirm, at… |
| `useRecurringRollover.ts` | 80 | 1 | useRecurringRollover | Reconcile the active vault after its read, incoming changes, and local midnig… |
| `useVaults.ts` | 166 | 1 | useVaults | A vault's own writes: switch, create, delete, pick its folder and reveal it o… |
| `useVaultWatch.ts` | 92 | 1 | UseVaultWatchOptions, useVaultWatch | Keeps the open vault honest about the disk. Files the MCP server, another edi… |

## src/hooks — 4 файлов, 716 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useCalendarSchedule.ts` | 123 | 3 | CalendarTask, UseCalendarScheduleParams, CalendarScheduleResult, useCalendarSchedule | Splits tasks into overdue, unscheduled and per-day buckets, expanding recurre… |
| `useDeviceAccess.ts` | 33 | 1 | useDeviceAccess | Android overlay / alarm / notification access, re-read whenever the app regai… |
| `useItemActions.ts` | 283 | 4 | TYPE_LABELS, useItemActions | The action set behind every item menu: open, reply, pin, move, decompose, del… |
| `useSuggestedActions.ts` | 277 | 1 | ActionHistoryEntry, useSuggestedActions | Applies, rejects and undoes the actions the assistant proposes in chat. |

## src/hooks/gestures — 6 файлов, 1097 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useDragToScroll.ts` | 233 | 2 | DragToScrollOptions, useDragToScroll | Mouse grab-to-scroll with a click threshold and Apple-style flick momentum. |
| `usePhotoPager.ts` | 321 | 2 | PhotoPagerOptions, usePhotoPager | One-finger deck for the full-screen viewer: pager, pinch, pan, swipe to close. |
| `usePointerDnd.ts` | 245 | 5 | DragItemPayload, UsePointerDndOptions, PointerDndState, usePointerDnd | Pointer-based drag and drop: one live gesture, hover zones, payload on drop. |
| `usePullToSearch.ts` | 89 | 1 | usePullToSearch | Pull a list past either end to open search, with rubber-band damping. |
| `useSheetDrag.ts` | 158 | 1 | useSheetDrag | Drag-to-dismiss for a one-detent sheet, transforms written straight to the co… |
| `useSwipeGesture.ts` | 51 | 3 | SwipeGestureOptions, useSwipeGesture | Left/right swipe detection with a threshold and axis lock, for phone rows. |

## src/hooks/layout — 5 файлов, 335 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useComposerInset.ts` | 39 | 2 | useComposerInset | Publishes the composer dock's live height as --composer-inset for the feed. |
| `useEditorPaneRect.ts` | 59 | 1 | EditorPaneRect, useEditorPaneRect | Measures the dockview pane a note opened from, before paint, and follows resi… |
| `useFlipLayout.ts` | 150 | 2 | useFlipLayout | FLIP motion for a list: moved cards glide, one appended card rises, scroll st… |
| `useIsMobile.ts` | 31 | 4 | useIsMobile | Tracks whether the viewport sits below the mobile breakpoint, on load and res… |
| `useVisualViewportHeight.ts` | 56 | 1 | useVisualViewportHeight | Writes the visual viewport height to --vvh, so the shell shrinks with the key… |

## src/hooks/media — 3 файлов, 378 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAttachmentSrc.ts` | 63 | 10 | AttachmentSrcs, AttachmentSources, useAttachmentSrcs, useAttachmentSrc | Resolves attachment ids to object URLs on demand, keeping media bytes out of … |
| `useAttachmentSrcOnDemand.ts` | 111 | 2 | AttachmentSource, useAttachmentSrcOnDemand, useSeenTiles | One narrow resolver for attachment bytes, shared by the viewer's slides and t… |
| `useComposerMedia.ts` | 204 | 1 | UseComposerMediaOptions, useComposerMedia | Composer's record controls: hold or lock, audio/video switch, finish and send. |

## src/hooks/ui — 6 файлов, 524 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAssistantActions.ts` | 90 | 1 | useAssistantActions | Applies an action tapped under a telegram answer, and tells the relay what it… |
| `useDeepLink.ts` | 38 | 1 | useDeepLink | Opens the note an external `slag://` link points at. |
| `useGlobalHotkeys.ts` | 55 | 1 | useGlobalHotkeys | Routes keydown through the APP_COMMANDS catalogue and the top-layer Escape. |
| `useIntegrity.ts` | 122 | 1 | UseIntegrity, useIntegrity | The storage panel's state: run a check, hand the plan to the repair, keep the… |
| `useLayerStack.ts` | 123 | 1 | AppLayer, useLayerStack | LIFO dismiss stack shared by Escape and Android/browser back, synced to histo… |
| `usePresence.ts` | 96 | 31 | usePresence | Keeps a surface in the DOM through its exit transition, so CSS can finish it. |

## src/lib — 7 файлов, 1955 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `activityStats.ts` | 153 | 2 | ActivityDay, ActivitySummary, dateKey, summarizeActivity | Turns the vault's own timestamps into a GitHub-style year of activity. |
| `backupService.ts` | 596 | 2 | SlagManifest, BackupService, backupService, DEFAULT_BACKUP_SETTINGS | Vault snapshots: pack a zip, list what is there, restore one, drop old ones. |
| `commands.ts` | 279 | 3 | CommandCategory, AppCommandContext, AppCommand, isMac, formatShortcut, +3 | ponytail: central command & hotkey engine for SLAG v2 without external depend… |
| `memory.ts` | 374 | 6 | MEMORY_LIMIT, MEMORY_PROMPT_LIMIT, MEMORY_TAG_PROMPT_LIMIT, MEMORY_KINDS, MEMORY_KIND_LABEL, +14 | The assistant's own memory: what it knows about the person, how it ages, how … |
| `motion.ts` | 229 | 9 | MotionToken, MotionEase, prefersReducedMotion, motionMs, motionEase, +6 | Reads the CSS motion tokens as numbers, so JS animation timing matches theme.… |
| `navigation.ts` | 13 | 5 | navigatePage | Единственная точка перехода между страницами приложения (?page=…). |
| `searchService.ts` | 311 | 4 | preloadSearchEngine, getSearchableAttachmentText, RU_ENDINGS, RU_STOPWORDS, initSearchIndex, +1 | Orama lives in its own lazy chunk (~76 kB, 25 kB gzip). On the 1000-note prob… |

## src/lib/ai — 30 файлов, 5460 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `actionParser.ts` | 376 | 3 | cleanSnippetText, extractActionBlock | Turns the model's reply into typed actions, tolerating fences, chatter and br… |
| `adapters/anthropicAdapter.ts` | 176 | 1 | AnthropicMessagesAdapter | Speaks the Anthropic Messages protocol: tools, tool results and reasoning blo… |
| `adapters/errorMessage.ts` | 19 | 3 | extractErrorMessage | One answer to "what did the provider actually say". |
| `adapters/openAiAdapter.ts` | 210 | 1 | OpenAiChatAdapter | Speaks the OpenAI chat-completions protocol, including tool calls and hosted … |
| `adapters/openAiResponsesAdapter.ts` | 213 | 2 | OpenAiResponsesAdapter | Speaks the OpenAI Responses protocol that KIE and DeepSeek endpoints expect. |
| `aiClient.ts` | 97 | 2 | PromptRequest, PromptResult, resolveAiTarget, parseJsonContent, completePrompt, +3 | Sends one assistant turn through whichever connection the chat role resolves … |
| `aiService.ts` | 390 | 7 | CategorizeResult, TriageSuggestion, TriageProgress, TriageProgressCallback, categorizeDraft, +4 | App-facing AI calls: categorize a note, triage a folder, send a chat turn. |
| `appGuide.ts` | 243 | 2 | APP_GUIDE_TOPICS, AppGuideTopic, getAppGuideContent | ponytail: curated topic catalog for in-app assistant UI navigation & feature … |
| `connections/endpoints.ts` | 87 | 4 | WireTarget, resolveKieEndpoint, resolveWire, resolveTranscriptionEndpoint, resolveGeminiGenerateEndpoint | Endpoint and adapter for one connection + model. The only place that knows a … |
| `connections/presets.ts` | 129 | 8 | ProviderPreset, PROVIDER_PRESETS, connectionCapabilities, connectionSupports, presetFor, +3 | The provider catalogue: one table saying what each kind of connection can do. |
| `connections/resolve.ts` | 140 | 8 | ResolvedAiTarget, RelayAccess, isSubscriptionMode, resolveRelayAccess, resolveRoleConnection, +8 | Who serves each role: the subscription relay, or a ready BYOK connection. |
| `connections/secrets.ts` | 65 | 3 | AI_KEY_SECRET_PREFIX, AiKeyEntry, aiKeySecretName, stripAiKeys, applyAiKeys, +1 | Provider API keys are secrets, not settings: `slag_ai_settings_v2` keeps the … |
| `connections/settings.ts` | 244 | 9 | DEFAULT_AI_SETTINGS, isConnectionReady, isConnectionReadyFor, normalizeAiSettings, loadAiSettings | Default settings, readiness rules and the one legacy → connections migration. |
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
| `orchestrator.ts` | 444 | 2 | AssistantOrchestrator, assistantOrchestrator, resolveKieEndpoint, resolveAiTarget, extractActionBlock, +3 | Runs the assistant loop: prompt, model turn, local tools, until the reply is … |
| `prompt.ts` | 265 | 1 | buildSystemPrompt | Composes the assistant system prompt: today's tasks, folder context and tone … |
| `taggingPrompt.ts` | 247 | 1 | TagUsage, TaggingFolder, DraftTaggingInput, TriageNote, TriageTaggingInput, +4 | Prompt assembly for AI auto-tagging: what the vault is, which tags exist alre… |
| `tags.ts` | 20 | 3 | TagStyle, isStopTag, formatTag | Tag spelling rules shared by note triage and assistant memory: one dictionary… |
| `toolDefinitions.ts` | 201 | 1 | getCanonicalTools | Declares the tool schemas once, so every protocol adapter sends the same set. |
| `tools.ts` | 519 | 1 | createLocalToolExecutor | The tools the assistant may call: search notes, read one, and report on the v… |
| `types.ts` | 90 | 16 | AssistantToolDefinition, AdapterTurnHistoryItem, LlmAdapterTurnRequest, LlmAdapterTurnResponse, LlmProtocolAdapter, +2 | The contract between the assistant loop and a protocol adapter: request, repl… |

## src/lib/logger — 2 файлов, 621 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `logger.ts` | 556 | 77 | LogListener, logger | The log: levels, scopes, listeners, the buffer, retention and persistence. Wh… |
| `logRedaction.ts` | 65 | 1 | maskSensitiveString, sanitizeForLog | Masking secrets in log messages and payloads; the one place that knows what a… |

## src/lib/media — 17 файлов, 2001 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `audioHelper.ts` | 189 | 11 | AudioTrack, AudioScopeMode, AudioTypeFilter, detectAudioFormat, splitAudioName, +6 | Builds the playable audio library from note attachments: format, duration, co… |
| `audioSession.ts` | 330 | 2 | PLAYBACK_SPEEDS, AudioSessionSnapshot, subscribeAudioSession, getAudioSessionSnapshot, setAudioQueue, +14 | The one player: its element, its Web Audio graph and its state live outside e… |
| `audioSpectrum.ts` | 439 | 3 | OrbFeatures, ORB_SILENCE, ORB_FFT_SIZE, createSpectrumReader | Features for the liquid orb. |
| `blobToDataUrl.ts` | 16 | 1 | blobToDataUrl | A blob as a `data:` URL. |
| `byteCodec.ts` | 42 | 9 | bytesToBase64, base64ToBytes, dataUrlToBytes, toArrayBuffer | Bytes to base64 and back without a Buffer, for crypto and file payloads in th… |
| `deviceGallery.ts` | 39 | 1 | getGalleryAccess, requestGalleryAccess, listDeviceMedia, DeviceMediaItem, DeviceMediaKind | Lists photos and videos from the Android media store, which the webview canno… |
| `enrichment/dispatch.ts` | 291 | 4 | canEnrichAttachments, enrichAttachment, enrichItemAttachments | Picks a transport per attachment type, tries the role's connection first, the… |
| `enrichment/gemini.ts` | 60 | 1 | analyzeImageGemini, transcribeAudioGemini | Native Gemini generateContent: the only transport that reads audio inline ins… |
| `enrichment/http.ts` | 27 | 4 | ENRICH_TIMEOUT_MS, enrichFetch, dataUrlToBlob, dataUrlToText | One deadline for every provider call and the data-URL plumbing they all need. |
| `enrichment/openAi.ts` | 98 | 1 | analyzeImageOpenAi, transcribeAudioOpenAi | OpenAI-compatible transports: chat-completions for images, multipart for spee… |
| `enrichment/relay.ts` | 30 | 1 | callRelayMedia | Subscription media: the relay owns the provider keys, the client only carries… |
| `enrichment/text.ts` | 71 | 5 | extractFocalContext, buildImageInstruction, buildFileInstruction, parseEnrichmentReply, summarizeTranscript | Instructions sent to vision/audio/file models, and the parsing of their repli… |
| `enrichment/types.ts` | 6 | 5 | EnrichmentResult | What every enrichment transport returns, regardless of protocol. |
| `fileDropHelper.ts` | 115 | 4 | MAX_ATTACHMENT_BYTES, attachmentType, attachmentFromDataUrl, processFileListToAttachments | What the storage layer takes inline without turning into a memory problem. |
| `folderBrowser.ts` | 128 | 4 | listFolders, pickFolder, listFolderEntries, pickFilesFromSystem, readEntryBytes, +3 | Folders the person already granted; the grant survives restarts and app updat… |
| `imageCodec.ts` | 91 | 3 | EncodedImage, ImageEncodeOptions, STORED_IMAGE_MAX_DIM, STORED_IMAGE_QUALITY, UNCOMPRESSIBLE_IMAGE_TYPES, +3 | Shrinks and re-encodes images on a canvas before storage, sync or sending to … |
| `mediaEvents.ts` | 29 | 2 | bindMediaEvents | One list of media-element events, bound and unbound in one move. A player that |

## src/lib/notify — 5 файлов, 836 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `assistant.ts` | 214 | 3 | ASSISTANT_TOOL_ALLOWLIST, buildVaultFacts, setAssistantForRoutes, buildAssistantAnswer, clearAssistantHistory, +1 | The assistant path of the bot: what a question forwarded from telegram is ans… |
| `assistantAction.ts` | 199 | 3 | describeActionTarget, ActionCardDescriptor, describeActionCard, toAssistantAction, parseAssistantAction | The action offered under a telegram answer: how it is packed for the relay an… |
| `plan.ts` | 307 | 3 | localDateKey, resolveReminder, reconcileNotifications, runLocalReminders, LocalNotificationResult, +2 | Delayed reminders: arm them on the relay, toast them locally when nothing els… |
| `prefs.ts` | 78 | 6 | DEFAULT_NOTIFY_PREFS, integrationsLive, describeError, getNotifyRoutes, saveNotifyRoutes, +3 | Notify settings: what this vault wants to hear, where reminders go, and the w… |
| `quiet.ts` | 38 | 1 | DAY_MS, inQuietHours, shiftOutOfQuiet | Quiet hours: the window where a reminder waits instead of ringing. |

## src/lib/platform — 14 файлов, 1475 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `appUpdate.ts` | 158 | 1 | updateErrorCode, updateErrorText, getAppUpdatePlatform, checkAppUpdate, installAppUpdate, +6 | In-app self-update: the only place that talks to the Rust updater commands an… |
| `deepLink.ts` | 60 | 1 | OPEN_LINK_EVENT, parseNoteLink, takePendingNoteLink, onDeepLinkOpened | `slag://` links: the OS hands a URL to the app, this turns it into the note b… |
| `deviceAccess.ts` | 37 | 4 | isAndroidApp, getDeviceAccessStatus, openDeviceAccessSettings, DeviceAccessStatus, DeviceAccessTarget | The Android grants a reminder needs that are not runtime permissions: draw ov… |
| `encryptedLocalStore.ts` | 193 | 1 | getLocalSecret, setLocalSecret, deleteLocalSecret | Secrets at rest for builds without an OS keychain: AES-GCM envelopes under a … |
| `folderOpener.ts` | 73 | 5 | OpenFolderResult, openAppFolder | Opens logs, notes or backups in the OS file manager, with a toast when no she… |
| `installResume.ts` | 28 | 2 | InstallResumeInput, shouldResumeInstall | Resuming an Android apk install after the person flips "install unknown apps". |
| `openExternal.ts` | 22 | 5 | isNativeWebview, openExternalUrl | Opens a link in the system browser. Telegram deep links are the reason this e… |
| `platform.ts` | 79 | 1 | PlatformInfo, getPlatformInfo, setupSystemHotkey, removeSystemHotkey | Reports the desktop OS, session type and hotkey backend so settings can adapt. |
| `secretEnvelope.ts` | 29 | 4 | SecretEnvelope, SecretEnvelopeStore, readEnvelope | The AES-GCM envelope both secret stores keep: the same fields in a browser pr… |
| `secretFileBackend.ts` | 89 | 1 | hasSecretEnvelopes, fileEnvelopeStore | Native ciphertext at rest: one flat map of `secretKey → { v, iv, data }` in `… |
| `secretStore.ts` | 266 | 8 | SECRET_KEYS, SecretBackend, installSecretBackend, initSecretStore, getCachedSecret, +3 | One place for sync secrets at rest. Desktop uses the OS keychain; a build wit… |
| `updateChannel.ts` | 27 | 2 | DEFAULT_UPDATE_CHANNEL, UPDATE_CHANNEL_OPTIONS, normalizeUpdateChannel, readUpdateChannel, writeUpdateChannel | Which release stream this install follows. The choice is device-local on purp… |
| `windowControls.ts` | 379 | 19 | isMobilePlatform, isDesktopApp, isPrimaryWindow, minimizeWindow, toggleMaximizeWindow, +15 | Window chrome and platform checks: main window, minimize, maximize, desktop o… |
| `writeJsonAtomic.ts` | 35 | 3 | writeJsonAtomic, writeAppDataTextAtomic | The one way a JSON file this app owns gets replaced: the next snapshot is wri… |

## src/lib/storage — 32 файлов, 7435 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentData.ts` | 21 | 4 | stripAttachmentList, stripAttachmentData | Attachments as they belong in the localStorage index: metadata only. |
| `attachments.ts` | 364 | 4 | AttachmentStore | Stores attachment bytes on disk and in IndexedDB, handing the UI blob URLs in… |
| `folderSource.ts` | 52 | 3 | folderMetaFor, diffFolderPaths | A folder exists because its directory does. This module turns the paths found… |
| `folderStore.ts` | 275 | 2 | FolderStoreHost, readFolders, rememberFolders, forgetVaultFolders, writeFolder, +5 | Writing folders: save, rename with the note cascade, move by drag, describe, … |
| `index.ts` | 1539 | 52 | StorageOrigin, StorageChangeEvent, StorageChangeListener, VaultDiskChange, StorageService, +6 | The one door to the vault: notes, cache and change events, and delegation to … |
| `indexedDb.ts` | 160 | 2 | idbSaveAttachment, idbGetAttachment, idbGetAllAttachments, StoredSnapshotRecord, idbSaveSnapshot, +3 | IndexedDB blob store for attachment bytes and backup snapshots, keyed by id. |
| `integrityReader.ts` | 97 | 1 | tauriVaultReader | The wall between the integrity scans and the disk: the app reads its vault th… |
| `integrityService.ts` | 163 | 1 | IntegrityRun, RepairOutcome, runIntegrityCheck, applyIntegrityRepair, describePlan, +1 | What the storage panel calls: run the scans over the live vault and, when ask… |
| `integrityStore.ts` | 90 | 1 | encodeIndex, decodeIndex, encodeLeaves, decodeLeaves, integrityDir, +4 | The integrity index: a tiny inline summary, a bulk leaves file, and the codec… |
| `legacyJson.ts` | 18 | 3 | parseLegacyJson | The JSON an older build left in the webview profile. Every module that moves … |
| `legacyProfile.ts` | 439 | 1 | LegacyVaultSection, LegacyVaultKey, LegacyKeySplit, splitLegacyKeys, importLegacyProfile | The one-off move off the webview profile. |
| `noteDiskProjection.ts` | 17 | 1 | noteDiskProjection, editFromDisk | Compare a watcher snapshot with what the last successful write could actually… |
| `noteRegistry.ts` | 40 | 7 | NoteOrigin, NoteMutation, AcceptedNote, FolderTreeListener, FolderGroupListener, +1 |  |
| `noteRemoval.ts` | 25 | 1 | notesRemovedByImport | Which files a synced import takes off the disk. |
| `port.ts` | 86 | 10 | ChangeOrigin, SyncedVaultData, VaultPort, setVaultPort, vault | The slice of the vault that sync may touch. The app backs it with StorageServ… |
| `prefs.ts` | 214 | 24 | PrefsBackend, PrefsProfileBackend, initPrefs, getPref, setPref, +3 | Preferences: the one place settings live, wherever they came from. |
| `prefsBackend.browser.ts` | 42 | 1 | prefsBackend | Browser settings: `localStorage`, the same keys and the same strings that wer… |
| `prefsBackend.native.ts` | 60 | 1 | prefsBackend | Native settings: one JSON object of key → string in `<AppData>/settings.json`. |
| `settingsStore.ts` | 959 | 5 | SettingsStateFiles, SettingsStoreHost, hydrateSettings, flushDraftWrites, projectSharedSettings, +22 | The small per-vault things a reload must not lose: composer and fullscreen dr… |
| `sharedProjection.ts` | 68 | 2 | workspaceSharedMutations, memorySharedMutations, draftSharedMutation, sharedSettingsProjection |  |
| `stateSections.ts` | 491 | 6 | STATE_SECTIONS, ComposerDraftMap, FullscreenDraftMap, TelegramThreadEntry, DraftsSection, +24 | The shape of what a vault's `state.json` keeps for `settingsStore`: drafts, t… |
| `syncReconcile.ts` | 165 | 1 | SyncedVaultSnapshot, StagedSyncImport, ReconciledSyncImport, reconcileSyncedVault | A bundle is written from a snapshot: the user keeps typing while it travels t… |
| `trashStore.ts` | 80 | 2 | TrashStoreHost, trashStorageKey, readTrash, trashItem, recoverFromTrash | Keeps deleted notes in a per-vault trash, so restore happens before sync. The… |
| `usage.ts` | 402 | 2 | MediaKind, LocalUsageGroup, LocalUsage, MediaTypeUsage, HeavyAttachment, +16 | What the store actually occupies: the settings file, the vault's state and fi… |
| `vaultDiscovery.ts` | 28 | 1 | mergeDiscoveredVaults | The vault list lives in localStorage only, and a native webview profile can b… |
| `vaultFiles.ts` | 938 | 2 | VaultFilesDeps, VaultFiles | The vault as files on disk: where they live, how a name is claimed, how a not… |
| `vaultRegistry.ts` | 179 | 2 | VaultRegistryHost, initCurrentVault, getVaults, saveVaultMeta, discoverVaults, +5 | Which vault the app is looking at: the registry kept in `prefs` (`settings.js… |
| `vaultRegistryModel.ts` | 65 | 1 | toVaultMeta, normalizeVaultRegistry, upsertVaultMeta, removeVaultMeta | The vault registry as a value: what a stored list means, and how one entry jo… |
| `vaultTransfer.ts` | 109 | 1 | VaultSnapshot, buildVaultExportJson, VaultImportIo, VaultImportPayload, importVaultPayload, +1 | The vault interchange format: export, import and backup JSON, apart from pers… |
| `vaultWatch.ts` | 193 | 1 | VaultWatchOptions, VaultWatch, canWatchVault, startVaultWatch | Notices .md files and folders that appeared, changed or vanished under the va… |
| `vaultWatchDiff.ts` | 41 | 1 | NoteFileStamp, VaultFileChange, diffNoteFiles | The pure half of the vault sweep: two stamps in, the paths that need re-readi… |
| `writeGuard.ts` | 15 | 1 | NoteIdentity, hasNewerVersionOnDisk | The one comparison a write makes before it replaces a file: has this note mov… |

## src/lib/sync — 50 файлов, 11638 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `account.ts` | 677 | 29 | accountClient, generateMnemonic, AccountDevice, AccountDeviceInput, AccountInfo, +19 | The sync account: session and sign-in, what the plan is, and the device ident… |
| `accountCrypto.ts` | 266 | 6 | AccountIdentity, generateAccountIdentity, signDeviceChallenge, getOrCreateDeviceIdentity, renameStoredDevice, +3 | Derives account and device keys, and wraps one vault key for one specific dev… |
| `accountTypes.ts` | 217 | 13 | AccountInfo, AccountDevice, VaultGrant, AccountVault, VaultInvitation, +19 | Shapes of the relay account API: plans, devices, vault grants and invitations. |
| `apiBase.ts` | 5 | 4 | apiBase | The relay address without trailing slashes: every request path starts with on… |
| `applyBundle.ts` | 478 | 2 | persistIncomingBundle, mergeAssistantPrompt | What a bundle from the relay actually does to the vault: tombstones, staged |
| `attachmentSignature.ts` | 7 | 2 | attachmentSignature | Cheap identity for an attachment: name plus size, enough to spot a stale copy. |
| `bip39Words.ts` | 2052 | 1 | BIP39_WORDS | Standard BIP-39 English wordlist (2048 words) |
| `crypto.ts` | 181 | 14 | generateMnemonic, validateMnemonic, deriveVaultKey, deriveRoomId, encryptBundle, +5 | Generates a cryptographically secure 12-word recovery seed phrase |
| `deviceAdmin.ts` | 61 | 1 | DeviceAdminHost, applyAccountDevices, addTrustedDevice, setDeviceAllowedVaults, removeTrustedDevice, +2 | Who may read this vault: the trusted-device list mirrored into the sync confi… |
| `deviceKind.ts` | 34 | 2 | DeviceKind, deviceKind | What form factor a device record describes, for the one glyph its row wears. |
| `devices.ts` | 221 | 3 | normalizeTrustedDevice, touchDeviceLastSeen, normalizeTrustedDevicesFromAccount, computeSubscription, createDefaultDeviceName, +7 | Normalizes device records from the account and derives the subscription shown… |
| `entities/registry.ts` | 47 | 1 | createSyncOpFromStorageEvent | Translates a storage change into the sync operation the relay understands. |
| `entities/types.ts` | 17 | 5 | SyncEntityKind, SyncAction, SyncOperation | The sync vocabulary: which entities travel, which actions exist, what one op … |
| `errorText.ts` | 16 | 1 | syncErrorText | What the status row says when a request dies before the relay answers. |
| `index.ts` | 6 | 3 | * from ./types, * from ./crypto, * from ./pairing, * from ./syncEngine | Barrel: re-exports the sync protocol, crypto, pairing and engine for lib/sync… |
| `itemDeletions.ts` | 33 | 1 | ItemDeletion, deletionsFromOutbox | Which notes a push announces as gone. |
| `localBookkeeping.ts` | 550 | 9 | SYNC_SECTION, SyncScope, stateHashKey, tombstonesKey, sentHashesKey, +33 | What this device sent, knows and deleted — read from `state.json`'s `sync` se… |
| `manifest/channel.ts` | 217 | 5 | WIRE_VERSION, MAX_WIRE_BYTES, WireBody, PeerManifest, toWire, +8 | How a manifest crosses the wire: shape, validation, comparison. |
| `manifest/peers.ts` | 111 | 3 | manifestRoomUrl, parsePeerManifests, readPeerManifests | Who else in this room published a root. |
| `manifest/prefs.ts` | 13 | 2 | readManifestAutoCheck, writeManifestAutoCheck | Device-local: a phone on mobile data may not want to compare every change. |
| `manifest/publish.ts` | 37 | 1 | publishManifest | Writes this device's own manifest row into the room. |
| `manifest/schedule.ts` | 90 | 1 | scheduleManifestCheck, requestManifestCheck, clearManifestCheck | When the room is compared: one timer, the earliest deadline anybody asked for. |
| `manifest/sync.ts` | 119 | 3 | getManifest, syncManifest | Compare peer snapshots for diagnostics. A snapshot cannot authorize vault wri… |
| `notes/bootstrap.ts` | 127 | 0 | BootstrapCopy, BootstrapDecision, planBootstrap, sealBootstrap, sealFolderRegistrySeed | Runs on a trusted client (or local migration tool), never at the relay with d… |
| `notes/channel.ts` | 105 | 2 | NoteHttpError, NoteChannel | HTTP catch-up and fallback share the room's existing account authorization. |
| `notes/journal.ts` | 172 | 6 | JournalKind, RegistryValue, NoteBase, sameRegistryValue, JournalAttempt, +12 | Pure transitions for an ordered queue of local intentions; disk and network s… |
| `notes/mediaWire.ts` | 49 | 1 | REGISTRY_MEDIA_MAX_BYTES, sealRegistryMedia, openRegistryMedia |  |
| `notes/merge.ts` | 96 | 10 | relayNote, equal, noteDifferences, sameNote, mergeNote | Three-way merge of note properties, after domain normalization and before sea… |
| `notes/mergeValidation.ts` | 51 | 1 | noteMergeViolations | Reject combinations whose individual property edits do not compose safely. |
| `notes/migrationExport.ts` | 84 | 1 | exportMigrationSnapshot, canExportMigrationSnapshot | Local-only evidence: preserve physical copies, including duplicate IDs and tr… |
| `notes/persistence.ts` | 156 | 3 | hasSharedRegistryEnrollment, enrolledNoteGeneration, enrolledFolderTree, loadNoteJournal | Registry state is scoped to a room generation; an old queue is never silently… |
| `notes/reconcile.ts` | 46 | 2 | Candidate, confirmedBase, candidate | Decide what to send from the durable intent and the currently confirmed head. |
| `notes/replica.ts` | 1042 | 1 | NoteReplica | Serializes local intents and canonical application, not the network. I/O is o… |
| `notes/session.ts` | 233 | 1 | openNoteSession | Negotiate once per connection generation, then bind the replica to that vault… |
| `notes/sharedBody.ts` | 60 | 18 | SharedKind, SharedValue, isLegacySharedKind, SharedBody, SharedMutation, +4 |  |
| `notes/sharedWorkspace.ts` | 109 | 5 | SharedWorkspaceField, SharedWorkspace, SharedWorkspaceValue, isSharedWorkspaceField, selectSharedWorkspace, +3 |  |
| `notes/wire.ts` | 319 | 20 | FOLDER_TREE_ID, RegistryBody, NoteKind, NoteMode, NoteStatus, +32 | The authenticated relay sees routing metadata, never the note's identity or b… |
| `outbox/outbox.ts` | 74 | 1 | Outbox | Queues unsent sync operations per vault, compacting repeats of the same entit… |
| `pairing.ts` | 171 | 2 | createPairingSession, claimPairingSession, approvePairingSession, approveAccountPairingSession, rejectPairingSession, +2 | Creates a new 5-minute pairing session with a 6-digit PIN on the relay server |
| `presence.ts` | 28 | 1 | DevicePresence, devicePresence | Who is actually on the line right now. The relay touches a device's `lastSeen… |
| `pullPage.ts` | 64 | 1 | PullPageState, PullStep, nextPullStep, pullDeadlineMs, shrinkPullBudget, +1 | Pure pull-page policy: how big one page of the room feed may be, how long to … |
| `pushBundle.ts` | 361 | 1 | pushLocalChanges | Packing the local state into an outgoing bundle: what is dirty, what was alre… |
| `syncConfig.ts` | 220 | 4 | SyncConfigHost, computeSubscription, loadConfig, hydrateConfig, saveConfig, +4 | Where the sync config lives per vault, how requests are authorized, how a see… |
| `syncEngine.ts` | 1647 | 28 | PendingPush, SyncEngine, syncEngine, storage, accountClient | Owns sync: config, push of local changes, apply of incoming bundles, status r… |
| `syncSection.ts` | 269 | 3 | SyncSectionState, emptySection, sectionFromState, sectionToPatch, mergeSectionState, +7 | The shape of `state.json`'s `sync` section: which keys it holds, what each ma… |
| `syncSocket.ts` | 54 | 1 | SyncSocketHost, connectSocket, handleIncoming, acknowledgeBundle | The live socket: open it for the current room, accept a frame, acknowledge a … |
| `tombstones.ts` | 52 | 4 | TombstoneMap, tombstonesFromState, mergeTombstones, sanitizeTombstones | The tombstones a delete leaves behind, and the shape they take in `state.json… |
| `transport.ts` | 291 | 2 | TransportCallbacks, TransportOptions, SendAckOptions, SyncTransport | The websocket link to the relay: connect, heartbeat, reconnect, route incomin… |
| `types.ts` | 218 | 30 | DeviceSyncMode, DeviceProfile, SyncConnectionState, SubscriptionInfo, ManifestPeerStatus, +14 | Shared sync types: device profile, connection state, subscription and status … |
| `vaultSharing.ts` | 85 | 4 | getLocalVaultId, shareVaultWithDevice, acceptSharedVault, installSharedVault | Hands a vault key to another device and accepts one, so the vault opens on bo… |

## src/lib/tasks — 4 файлов, 204 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `taskCompletion.ts` | 57 | 1 | applyTaskCompletion | keep every local status entry point consistent, without applying transitions … |
| `taskQuickFilter.ts` | 25 | 11 | TASK_QUICK_FILTER_LABELS, TaskQuickFilterId, TaskQuickFilter, matchesTaskQuickFilter | Classifies existing tasks by their saved local deadline, not their reminder. |
| `taskSchedule.ts` | 13 | 4 | classifyDueDate, classifyTaskSchedule | A local calendar comparison, independent of reminder time and task recurrence. |
| `taskUtils.ts` | 109 | 18 | baseTaskId, parseSubtasksFromContent, toggleCheckboxInContent, setAllCheckboxesInContent, migrateLegacySubtasksToContent, +1 | The calendar projects a recurring task into every occurrence as |

## src/lib/text — 7 файлов, 663 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentEmbed.ts` | 109 | 5 | ATTACHMENT_SCHEME, AttachmentEmbed, findAttachmentEmbeds, markdownWithAttachmentEmbeds, resolveAttachmentByName, +4 | Obsidian attachment embeds (`![[name]]`): parsing the token and resolving it … |
| `chatMarkdown.ts` | 72 | 1 | ChatSegment, splitTaskBlocks | Splits an assistant reply into markdown and fenced task blocks the chat rende… |
| `diffUtils.ts` | 266 | 1 | WordChunk, SideBySideDiffRow, DiffResult, MetadataDiffItem, computeLineWordDiff, +2 | Line and word diffs for the note history view, with both sides numbered. |
| `formatBytes.ts` | 9 | 9 | formatBytes | Formats a byte count for UI labels, and stays silent when the size is unknown. |
| `mergeMarkdown.ts` | 121 | 1 | mergeMarkdown | Merge exact, independent Markdown edits; never guess alignment for repeated l… |
| `noteDisclosure.ts` | 79 | 9 | FOLDED_QUOTE, SPOILER_MARKER, FOLDED_QUOTE_PREFIX, withoutSpoilers, protectSpoilers, +1 |  |
| `shortId.ts` | 7 | 6 | shortId | An id cut down for reading: the head, an ellipsis, the tail. |

## src/lib/time — 5 файлов, 1352 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendarLayout.ts` | 139 | 6 | LayoutPositionedTask, TimedBlockBox, timedBlockBox, computeAntiOverlapLayout | Day-calendar geometry: which column a timed task takes and how tall its block… |
| `dateUtils.ts` | 186 | 35 | RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS, getISODateString, parseISODateString, getTodayIso, +14 | dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2. |
| `recurrenceHelper.ts` | 279 | 3 | RECURRENCE_PRESETS, getIsoWeekday, formatRecurrenceLabel, computeNextStrictOccurrenceDate, computeNextOccurrence, +2 | Recurrence rules: parse, describe and advance a repeating task to its next oc… |
| `reminder.ts` | 171 | 8 | reminderClock, reminderClockLabel, reminderDay, reminderToIso, shiftReminderToDay, +1 | reminder.ts — что означает строка `reminder` и как её записать. |
| `todoistTaskParser.ts` | 577 | 12 | ParsedTodoistTask, parseTodoistInput, TaskTimeSlot, getTaskTimeSlot, extractAndStripTags, +2 | Parses Todoist-style quick input into title, due date, tags, priority, durati… |

## src/lib/vault — 20 файлов, 2102 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `demoVault.ts` | 250 | 1 | generateDemoItems | Generates a clean, cohesive set of starter demo items across the default fold… |
| `folderColor.ts` | 19 | 5 | isFolderColor, folderHue, folderColorCss |  |
| `folderItems.ts` | 37 | 3 | itemsInFolder, materialsInFolder | Records that belong to a folder. Inbox is a leaf: it holds only the items that |
| `folderOptions.ts` | 47 | 6 | FolderSelectOption, buildFolderOptions | Turns the flat folder list into the one tree of picker options every menu sha… |
| `folderPaths.ts` | 38 | 4 | sanitizeFolderName, parentPathOf, folderPathForName, folderPathUnder, isFolderPathFree, +2 | Folder names are file names on disk, so the OS-forbidden characters become da… |
| `folderTree.ts` | 153 | 9 | FolderNode, FolderTreeRow, FolderDropMode, folderName, folderRank, +5 | The folder hierarchy and the order it is drawn in: one tree for the sidebar, … |
| `integrity/fingerprint.ts` | 75 | 2 | canonicalJson, fingerprint, sha256Hex | One line per note that a device can compare byte for byte. |
| `integrity/manifest.ts` | 95 | 2 | buildManifest, compare | A vault reduced to three levels of hashes: one line per note, one per folder,… |
| `integrity/repair.ts` | 135 | 1 | planRepair | What a sweep would do, decided before anything is touched. |
| `integrity/scanners.ts` | 253 | 1 | scanDuplicateIds, scanPathMismatch, scanFolderMissing, scanGhostFolders, scanEmptyFolders, +5 | The scans themselves: what a vault looks like when it has quietly filled with… |
| `integrity/snapshot.ts` | 235 | 2 | FolderEntry, VaultReader, DiskNote, VaultSnapshot, buildSnapshot | Build a VaultSnapshot from a VaultReader abstraction. |
| `integrity/types.ts` | 206 | 17 | Severity, FixKind, ScannerId, FIX_KIND_BY_SCANNER, Finding, +14 | What a storage check finds, and what fixing it would do. |
| `itemSchema.ts` | 46 | 1 | PropertySchemaItem, ITEM_MUTABLE_PROPERTIES, ITEM_UPDATES_SCHEMA | Single Source of Truth (SSOT) metadata registry for SlagItem mutable fields. |
| `itemUpdates.ts` | 70 | 2 | applyItemUpdates | Applies a partial update to an item without touching storage. |
| `markdownSerializer.ts` | 217 | 7 | serializeItemToMarkdown, parseMarkdownToItem | Serializes a SlagItem into Markdown with YAML Frontmatter (Obsidian-compatibl… |
| `noteFilename.ts` | 35 | 5 | getSafeNoteFilename, withIdSuffix | ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; … |
| `noteSemantics.ts` | 31 | 2 | stripNoteTransportFields, frontmatterTags, normalizeNoteBody, noteProperties | Domain defaults shared by Markdown projection and registry comparison. |
| `safePath.ts` | 69 | 9 | SafeVaultPathOptions, safeVaultRelativePath, isSafeVaultRelativePath | One answer to "is this path allowed inside the vault": normalizes separators … |
| `stats.ts` | 67 | 2 | VaultStats, collectExistingTags, computeVaultStats | Read-only counters and tag tallies, with the inbox treated as the whole vault. |
| `vaultDisplay.ts` | 24 | 5 | getVaultDisplayName | Names a vault for the UI, adding a short id suffix only when two names collid… |

## src/mcp — 11 файлов, 2189 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachments.ts` | 121 | 1 | INLINE_ATTACHMENT_LIMIT_BYTES, TEXT_ATTACHMENT_LIMIT_BYTES, isImageAttachment, isTextAttachment, attachmentsDirs, +3 | Where the bytes of an attachment actually live, and how much of them the MCP … |
| `index.ts` | 57 | 0 | startMcpServer | Stdio entry point of the MCP server that exposes one vault to external AI cli… |
| `instructions.ts` | 25 | 1 | SERVER_INSTRUCTIONS | The paragraph a host may put into the system prompt: what this vault is, the … |
| `noteCard.ts` | 267 | 3 | ChecklistItem, AttachmentCard, NoteRelation, NoteCard, NoteCardInput, +5 | The full card of one note: everything a client asks for in a single call, bui… |
| `notePatch.ts` | 63 | 1 | NotePatch, NotePatchResolved, applyNotePatch | What a `save_note` call changes on an existing record: a patch, not a rebuild… |
| `prompts.ts` | 83 | 3 | registerMcpPrompts | MCP prompts that walk an agent through triage, daily planning and review. |
| `resources.ts` | 165 | 3 | registerMcpResources | MCP resources: folder map, pending tasks and notes a client can read without … |
| `serverInfo.ts` | 16 | 1 | SERVER_INFO | What a host shows beside the tools: a name and a version alone leave the serv… |
| `tools.ts` | 480 | 3 | registerMcpTools | MCP tools that read and write notes, tasks, folders and attachments in a vaul… |
| `types.ts` | 101 | 3 | McpVaultConfig, VaultStateData, NoteMatch, SaveNoteSchema, GetNoteSchema, +7 | Zod schemas and vault shapes the MCP tools accept, with their user-facing des… |
| `vault.ts` | 811 | 6 | AttachmentPayload, AttachmentRead, resolveVaultConfig, McpVault | The vault as the MCP server sees it: files on disk, frontmatter, attachments … |

## src/node — 5 файлов, 917 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `cli.ts` | 363 | 1 | CliOptions, parseFlags, runCli | The commands the node answers to. Loaded only after the environment and the s… |
| `env.ts` | 109 | 2 | slagHome, installNodeEnvironment | The browser surfaces the sync core still leans on, backed by files. Installed… |
| `index.ts` | 25 | 0 |  | Entry for the headless node. Everything below it is imported dynamically on p… |
| `secrets.ts` | 52 | 1 | initNodeSecretStore | Secrets at rest for the headless node: one 0600 file. A server has no keychai… |
| `vaultPort.ts` | 368 | 1 | NodeVault | The vault as the headless node sees it: notes are files under `notes/`, every… |

## src/node/stubs — 3 файлов, 89 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `storageSingleton.ts` | 8 | 0 | storage | `syncEngine` re-exports the browser store for the e2e specs. The headless bui… |
| `tauri.ts` | 29 | 0 | isTauri, getCurrentWindow, getCurrentWebviewWindow, listen, addPluginListener, +1 | Stubs for the tauri API, swapped in by the headless build. `isTauri()` must a… |
| `tauriFs.ts` | 52 | 0 | BaseDirectory, mkdir, writeTextFile, rename, readDir, +5 | Logs on disk go through plugin-fs in the browser build. A server writes them … |

## src/types — 2 файлов, 859 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 692 | 241 | SlagItemType, TaskStatus, SlagItemStatus, SlagItemPriority, SlagAttachment, +79 | The domain, in one place: notes, folders, vaults, attachments, sync and AI se… |
| `slashCommands.ts` | 167 | 3 | SlashCommand, SLASH_COMMANDS, CATEGORY_LABELS | The slash-command palette: trigger, aliases, icon and what each command inser… |
