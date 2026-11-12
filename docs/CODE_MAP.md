# CODE_MAP — карта модулей

Сгенерировано `npm run map:code`. Руками не править — перезапишется.
Читай эту карту до того, как грепать: колонка «импортят» показывает,
что модуль реально используется, «что это» — зачем он нужен.

Модулей: **441**, строк: **81795**, зон: **45**.

## Самые длинные файлы

| файл | строк | импортят |
|---|---:|---:|
| `src/lib/sync/bip39Words.ts` | 2052 | 1 |
| `e2e/slag/editor.spec.ts` | 1588 | 0 |
| `e2e/slag/views.spec.ts` | 1076 | 0 |
| `e2e/slag/workspace.spec.ts` | 885 | 0 |
| `src/lib/sync/syncEngine.ts` | 881 | 17 |
| `e2e/mobile.spec.ts` | 874 | 0 |
| `src/components/Feed/ItemCard.tsx` | 807 | 1 |
| `e2e/slag/feed.spec.ts` | 802 | 0 |
| `src/context/AppContext.tsx` | 715 | 62 |
| `src/lib/storage/index.ts` | 701 | 34 |
| `src/components/Feed/Composer.tsx` | 700 | 4 |
| `src/components/Editor/FullscreenEditor.tsx` | 640 | 1 |
| `src/components/Workspace/useCrossWindowDnd.ts` | 614 | 1 |
| `src/lib/backupService.ts` | 606 | 1 |
| `src/lib/media/attachmentEnrichment.ts` | 600 | 4 |

## e2e (playwright) — 91 файлов, 17569 строк

Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:

- `e2e/slag/editor.spec.ts` — 1588
- `e2e/slag/views.spec.ts` — 1076
- `e2e/slag/workspace.spec.ts` — 885
- `e2e/mobile.spec.ts` — 874
- `e2e/slag/feed.spec.ts` — 802
- `e2e/admin_panel.spec.ts` — 493
- `e2e/motion.spec.ts` — 451
- `e2e/initial_sync_engine.spec.ts` — 359
- `e2e/slag/feed_thumbs.spec.ts` — 351
- `e2e/mcp_server.spec.ts` — 337

## src — 3 файлов, 527 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `App.tsx` | 448 | 1 | App |  |
| `demo.tsx` | 68 | 0 | Playground |  |
| `main.tsx` | 11 | 0 |  |  |

## src/components — 1 файлов, 56 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `InitialSyncBoundary.tsx` | 56 | 1 | InitialSyncBoundary | Holds the shell until the first sync settles, so nobody is shown half a vault. |

## src/components/Account — 1 файлов, 349 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountCabinet.tsx` | 349 | 1 | AccountCabinet |  |

## src/components/Admin — 9 файлов, 2533 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AdminPanel.tsx` | 411 | 1 | AdminPanel |  |
| `Charts.tsx` | 333 | 4 | DataPoint, SparklineChart, BarChart, FunnelChart, DistributionGauge |  |
| `tabs/AccountsTab.tsx` | 428 | 1 | AccountsTab |  |
| `tabs/AiTab.tsx` | 192 | 1 | AiTab |  |
| `tabs/BillingTab.tsx` | 326 | 1 | BillingTab |  |
| `tabs/RelayTab.tsx` | 234 | 1 | RelayTab |  |
| `tabs/SecurityTab.tsx` | 68 | 1 | SecurityTab |  |
| `useAdminActions.ts` | 293 | 1 | GrantSubscriptionInput, AdminActionsDeps, useAdminActions |  |
| `useAdminData.ts` | 248 | 7 | AdminStats, AdminDevice, AdminVault, AdminAccount, BillingStats, +7 | Interfaces from AdminPanel.tsx |

## src/components/Audio — 9 файлов, 1849 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioCoverArt.tsx` | 157 | 1 | AudioCoverArt |  |
| `AudioPanel.tsx` | 280 | 2 | AudioPanel |  |
| `AudioPlaylistDrawer.tsx` | 265 | 1 | AudioPlaylistDrawer |  |
| `liquidOrb.ts` | 419 | 1 | OrbFrame, createOrbRenderer | The canvas orb that breathes with the audio: blobs driven by spectrum feature… |
| `panel/AudioArtwork.tsx` | 73 | 1 | AudioArtwork |  |
| `panel/AudioScrubber.tsx` | 82 | 1 | AudioScrubber |  |
| `panel/AudioTransport.tsx` | 182 | 1 | AudioTransport |  |
| `panel/PlaylistDrawer.tsx` | 63 | 1 | PlaylistDrawer |  |
| `panel/useAudioPlayback.ts` | 328 | 1 | useAudioPlayback |  |

## src/components/Composer — 1 файлов, 102 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `QuickComposerWindow.tsx` | 102 | 1 | QuickComposerWindow |  |

## src/components/Editor — 11 файлов, 2694 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachmentStrip.tsx` | 219 | 1 | AttachmentStripProps, AttachmentStrip |  |
| `EditorToolbar.tsx` | 172 | 1 | EditorToolbar, EditorToolbarProps | Editor toolbar assembly: top row, markdown palette, save/zen actions. |
| `editorToolbarParts.tsx` | 75 | 5 | ITEM_TYPE_OPTIONS, MarkdownDropdown, EditorToolbarProps, EditorTopBarProps, MarkdownPaletteProps | Shared props, options and dropdown state for the editor toolbar halves. |
| `EditorTopBar.tsx` | 61 | 1 | EditorTopBar | Editor top row: back, folder selector, item type. |
| `fullscreen/EditorTaskFields.tsx` | 292 | 1 | EditorTaskFieldsProps, EditorTaskFields |  |
| `fullscreen/useEditorAiActions.ts` | 71 | 1 | EditorAiActionsOptions, useEditorAiActions |  |
| `fullscreen/useEditorAttachments.ts` | 161 | 1 | EditorAttachmentsOptions, useEditorAttachments |  |
| `FullscreenEditor.tsx` | 640 | 1 | FullscreenEditor | The focused editor surface: CodeMirror wiring, hotkeys and the sheet's chrome. |
| `MarkdownPalette.tsx` | 364 | 1 | MarkdownPalette | Markdown utilities: history, styles, lists, inline formatting, links, attachm… |
| `MobileEditorBar.tsx` | 325 | 1 | MobileEditorBarProps, MobileEditorBar |  |
| `useFullscreenDraft.ts` | 314 | 1 | UseFullscreenDraftOptions, UseFullscreenDraftReturn, useFullscreenDraft |  |

## src/components/Feed — 48 файлов, 7603 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ActiveFilterBadges.tsx` | 198 | 2 | ActiveFilterBadgesProps, ActiveFilterBadges |  |
| `assistant/AssistantActionCard.tsx` | 397 | 1 | AssistantActionCard |  |
| `assistant/AssistantBanner.tsx` | 45 | 1 | AssistantBanner |  |
| `assistant/AssistantComposer.tsx` | 132 | 1 | AssistantComposer |  |
| `assistant/AssistantMessages.tsx` | 226 | 1 | AssistantMessages |  |
| `assistant/AssistantReasoning.tsx` | 39 | 1 | AssistantReasoning |  |
| `assistant/AssistantSearchResults.tsx` | 110 | 1 | AssistantSearchResult, AssistantSearchResults |  |
| `assistant/AssistantTextBubble.tsx` | 47 | 1 | AssistantTextBubble |  |
| `assistant/AssistantToolCalls.tsx` | 27 | 1 | AssistantToolCalls |  |
| `AssistantChat.tsx` | 234 | 2 | AssistantChat |  |
| `BaseComposer.tsx` | 272 | 2 | BaseComposerProps, BaseComposer |  |
| `chat/ChatTaskBlock.tsx` | 52 | 1 | ChatTaskBlock |  |
| `Composer.tsx` | 700 | 4 | ComposerProps, Composer | The create-a-note form: wiring, the autocomplete overlay, and composition of … |
| `composer/ComposerAiButton.tsx` | 30 | 1 | ComposerAiButtonProps, ComposerAiButton |  |
| `composer/ComposerAttachmentStrip.tsx` | 89 | 1 | ComposerAttachmentStripProps, ComposerAttachmentStrip |  |
| `composer/composerFields.ts` | 124 | 2 | ComposerDismissals, ComposerFieldSources, ComposerFields, resolveComposerFields | What the user waved away in the ghost chips. A dismissed value is still in the |
| `composer/ComposerRecordButton.tsx` | 45 | 1 | ComposerRecordButtonProps, ComposerRecordButton |  |
| `composer/ComposerReplyBanner.tsx` | 38 | 1 | ComposerReplyBannerProps, ComposerReplyBanner |  |
| `composer/ComposerTypeSelector.tsx` | 52 | 1 | ComposerTypeSelectorProps, ComposerTypeSelector |  |
| `composer/useComposerAiTags.ts` | 69 | 1 | UseComposerAiTagsOptions, useComposerAiTags |  |
| `composer/useComposerFiles.ts` | 155 | 1 | useComposerFiles | Getting files into the composer: picker, drop, paste. |
| `composer/useComposerSlashCommands.ts` | 143 | 1 | UseComposerSlashCommandsOptions, useComposerSlashCommands |  |
| `composer/useComposerSubmit.ts` | 203 | 1 | UseComposerSubmitOptions, useComposerSubmit |  |
| `ComposerTaskControls.tsx` | 257 | 1 | ComposerTaskControlsProps, ComposerTaskControls |  |
| `FeedColumnResizer.tsx` | 90 | 1 | FeedColumnResizer | Grab strips on both sides of the reading column. The width is published as |
| `FeedHeader.tsx` | 162 | 1 | FeedHeaderProps, FeedHeader |  |
| `FeedList.tsx` | 555 | 2 | FeedList | The feed: render window, sentinels and the composition of cards; the edges li… |
| `FolderSuggestionMenu.tsx` | 101 | 1 | FolderSuggestionMenu |  |
| `item/itemAttachments.ts` | 141 | 5 | THUMB_MAX_HEIGHT, THUMB_MAX_WIDTH, CardShape, AttachmentGroups, AttachmentCounts, +11 | One picture never eats the column: 320 tall, and never wider than 416 even as… |
| `item/ItemAudioNotes.tsx` | 45 | 1 | ItemAudioNotesProps, ItemAudioNotes |  |
| `item/ItemCardActions.tsx` | 55 | 1 | ItemCardActionsProps, ItemCardActions |  |
| `item/ItemFiles.tsx` | 84 | 1 | ItemFilesProps, ItemFiles |  |
| `item/ItemImages.tsx` | 198 | 1 | ItemImagesProps, ItemImages |  |
| `item/ItemReplyBanner.tsx` | 47 | 1 | ItemReplyBannerProps, ItemReplyBanner |  |
| `item/ItemSubtasks.tsx` | 82 | 1 | ItemSubtasksProps, ItemSubtasks |  |
| `item/ItemVideoNotes.tsx` | 41 | 1 | ItemVideoNotesProps, ItemVideoNotes |  |
| `ItemCard.tsx` | 807 | 1 | ItemCardProps, ItemCard | One note in the feed: reply swipe, width, OCR/expansion state, and the slots … |
| `list/FeedDateBubble.tsx` | 21 | 1 | FeedDateBubbleProps, FeedDateBubble |  |
| `list/FeedDropOverlay.tsx` | 30 | 1 | FeedDropOverlayProps, FeedDropOverlay |  |
| `list/FeedScrollHint.tsx` | 72 | 1 | FeedScrollHintProps, FeedScrollHint |  |
| `list/feedWindow.ts` | 91 | 1 | WINDOW_CHUNK, takeWindow, hasOlderItems, nextWindowSize, windowSizeAroundTarget, +3 | Карточек в окне; столько же добавляет один шаг догрузки старого. |
| `PinnedBanner.tsx` | 217 | 1 | PinnedBanner |  |
| `SlashCommandMenu.tsx` | 101 | 1 | SlashCommandMenu |  |
| `SuggestionMenuHeader.tsx` | 28 | 4 | SuggestionMenuHeader | Общая шапка подсказок композера (@ папки, # теги, / команды). |
| `SuggestionMenuShell.tsx` | 61 | 4 | SuggestionMenuShell |  |
| `TagSuggestionMenu.tsx` | 75 | 2 | TagMeta, TagSuggestionMenu |  |
| `useComposerAutocomplete.ts` | 395 | 1 | UseComposerAutocompleteOptions, useComposerAutocomplete |  |
| `useComposerDraft.ts` | 420 | 1 | ComposerDraftState, UseComposerDraftOptions, reviveReplyTarget, useComposerDraft |  |

## src/components/FolderProfile — 7 файлов, 693 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderActionsMenu.tsx` | 47 | 1 | FolderActionsMenuProps, FolderActionsMenu |  |
| `FolderIconGrid.tsx` | 34 | 1 | FolderIconGridProps, FolderIconGrid |  |
| `FolderProfile.tsx` | 105 | 3 | FolderProfileProps, FolderProfile |  |
| `FolderProfileHeader.tsx` | 228 | 1 | FolderProfileVariant, FolderProfileHeaderProps, FolderProfileHeader |  |
| `FolderStats.tsx` | 94 | 1 | FolderStatsVariant, FolderStatsProps, FolderStats |  |
| `folderStatsConfig.ts` | 35 | 2 | FolderStatKey, FolderStatDefinition, FOLDER_STATS, recordCountLabel |  |
| `useFolderProfileEdit.ts` | 150 | 2 | FolderProfileEditMode, FolderProfileEditOptions, FolderProfileEdit, useFolderProfileEdit |  |

## src/components/Landing — 1 файлов, 503 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LandingPage.tsx` | 503 | 1 | LandingPage | The public page: what SLAG is, what it costs, and the way into the app or the… |

## src/components/Logs — 2 файлов, 464 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LogModal.tsx` | 23 | 2 | LogModal |  |
| `LogViewer.tsx` | 441 | 3 | LogViewer | The log panel: filters by scope and level, copy and clear, docked and modal v… |

## src/components/Media — 9 файлов, 1401 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachSheet.tsx` | 203 | 1 | AttachSheet | One place that attaches things. On the phone it is the picker itself — tabs o… |
| `DesktopSources.tsx` | 83 | 1 | DesktopSourcesProps, DesktopSources |  |
| `FolderBrowser.tsx` | 143 | 1 | FolderBrowserProps, FolderBrowser |  |
| `MediaGrid.tsx` | 327 | 1 | MediaGridProps, MediaGrid |  |
| `MediaPreview.tsx` | 234 | 1 | MediaPreviewProps, MediaPreview |  |
| `MobilePicker.tsx` | 114 | 1 | MobilePickerProps, MobilePicker |  |
| `useDeviceGallery.ts` | 80 | 1 | useDeviceGallery | Rows of the device gallery, paged. Permission is part of the state: a grid th… |
| `useFolderBrowser.ts` | 90 | 1 | useFolderBrowser | The folders tab: granted folders, the files inside one of them, and the syste… |
| `ViewerVideo.tsx` | 127 | 2 | ViewerVideoProps, ViewerVideo |  |

## src/components/Mobile — 19 файлов, 2837 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendar/AgendaDayGroup.tsx` | 155 | 1 | AgendaDayGroupProps, AgendaDayGroup |  |
| `calendar/AgendaOverdueSection.tsx` | 44 | 1 | AgendaOverdueSectionProps, AgendaOverdueSection |  |
| `calendar/CalendarHeader.tsx` | 97 | 1 | CalendarHeaderProps, CalendarHeader |  |
| `calendar/calendarPositions.ts` | 126 | 5 | HOURS_24, HOUR_HEIGHT, CalendarSlotTarget, AgendaDayLayout, realTaskId, +8 | calendarPositions.ts — чистая раскладка повестки: порядок строк, линия «сейча… |
| `calendar/calendarRange.ts` | 124 | 5 | MobileCalendarMode, CalendarDay, parseISODate, buildWeekDays, buildThreeDayWindow, +7 | calendarRange.ts — чистые вычисления календарной сетки мобильного календаря: |
| `calendar/CalendarTaskRow.tsx` | 89 | 2 | CalendarTaskRowProps, CalendarTaskRow |  |
| `calendar/MonthPickerSheet.tsx` | 146 | 1 | MonthPickerSheetProps, MonthPickerSheet |  |
| `calendar/ThreeDayGrid.tsx` | 241 | 1 | ThreeDayGridProps, ThreeDayGrid |  |
| `calendar/WeekStrip.tsx` | 73 | 1 | WeekStripProps, WeekStrip |  |
| `MobileAssistantView.tsx` | 71 | 1 | MobileAssistantView |  |
| `MobileAudioView.tsx` | 12 | 1 | MobileAudioView |  |
| `MobileCalendarView.tsx` | 433 | 3 | MobileCalendarView |  |
| `MobileFloatingDock.tsx` | 159 | 1 | MobileFloatingDockProps, MobileFloatingDock |  |
| `MobileFolderInfoView.tsx` | 70 | 1 | MobileFolderInfoView | Phone container: the profile fills the screen, editing happens in place. |
| `MobileFoldersView.tsx` | 390 | 1 | MobileFoldersView |  |
| `MobileScreenHeader.tsx` | 86 | 5 | MobileScreenHeaderProps, MobileScreenHeader |  |
| `MobileSettingsView.tsx` | 133 | 1 | MobileSettingsView |  |
| `MobileShell.tsx` | 112 | 1 | MobileShell |  |
| `MobileTasksView.tsx` | 276 | 1 | MobileTasksView |  |

## src/components/Modals — 10 файлов, 2359 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `BaseModal.tsx` | 156 | 10 | BaseModalProps, BaseModal |  |
| `ComposerModal.tsx` | 59 | 2 | ComposerModal |  |
| `ConfirmDialog.tsx` | 55 | 1 | ConfirmDialog | The app's own question for irreversible actions. It replaces `window.confirm`… |
| `DiffModal.tsx` | 533 | 1 | DiffModalItemEntry, DiffModalProps, DiffModal | What an AI edit would change, before it is applied: the line diff and the acc… |
| `FolderInfoModal.tsx` | 94 | 2 | FolderInfoModal |  |
| `FolderModal.tsx` | 166 | 2 | FolderModal |  |
| `FolderViewModal.tsx` | 318 | 2 | FolderViewModal |  |
| `SettingsModal.tsx` | 210 | 2 | SettingsModal | The settings shell: a rail of tabs, the mobile and desktop frames, and the pi… |
| `TriageModal.tsx` | 485 | 1 | TriageModal | AI triage of the inbox: one batch of notes, folders and tags confirmed in a s… |
| `VaultModal.tsx` | 283 | 2 | VaultModal |  |

## src/components/RightPanel — 3 файлов, 446 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderInfoPanel.tsx` | 18 | 1 | FolderInfoPanel | Dock panel container: the same profile, laid out for a narrow column. |
| `FolderMediaTabs.tsx` | 311 | 1 | FolderMediaTabsProps, FolderMediaTabs |  |
| `useFolderMedia.ts` | 117 | 4 | FolderMediaData, useFolderMedia |  |

## src/components/Search — 1 файлов, 460 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SearchModal.tsx` | 460 | 3 | SearchModal | The ⌘K palette: one query, hits grouped by kind, and keyboard navigation thro… |

## src/components/Settings — 16 файлов, 2266 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountSettingsTab.tsx` | 66 | 1 | AccountSettingsTab | Первый раздел настроек: кто я, сколько места и куда идти за остальным. |
| `AiSettingsTab.tsx` | 303 | 1 | AiSettingsTab | Where the model comes from: the SLAG subscription or your own key, and what i… |
| `devices/DeviceActions.tsx` | 147 | 2 | DeviceName, DeviceRevokeButton, LocalSyncModeGroup, PairDeviceButton, PairDeviceModal |  |
| `devices/DeviceCard.tsx` | 24 | 1 | DeviceCard |  |
| `devices/DeviceList.tsx` | 60 | 1 | DeviceList |  |
| `devices/DevicePermissions.tsx` | 58 | 1 | DevicePermissions |  |
| `devices/useDevicePairing.ts` | 319 | 2 | DevicePairingController, useDevicePairing |  |
| `DevicesSettingsTab.tsx` | 196 | 1 | DevicesSettingsTab |  |
| `LogsSettingsTab.tsx` | 12 | 1 | LogsSettingsTab | The log viewer, docked inside settings instead of floating over the feed. |
| `MobileDockSettings.tsx` | 230 | 1 | MobileDockSettings |  |
| `SecretKeyField.tsx` | 49 | 1 | SecretKeyField | A secret, rendered as one settings row: the input is the row. |
| `SettingsUI.tsx` | 296 | 13 | SettingsGroup, SettingsDivider, SettingsRow, SettingsSwitch, SettingsSelect, +2 |  |
| `ShortcutsSettingsTab.tsx` | 101 | 1 | ShortcutsSettingsTab | The hotkey catalogue, rendered from the same table the keydown handler reads. |
| `SyncSettingsTab.tsx` | 83 | 1 | SyncSettingsTab | Канал: состояние, адрес сервера и когда гнать. Аккаунт и устройства — соседни… |
| `UiSettingsTab.tsx` | 102 | 1 | UiSettingsTab | How it looks: accent, fonts, density, panel widths and the mobile dock. |
| `VaultSettingsTab.tsx` | 220 | 1 | VaultSettingsTab | The vault itself: backups, snapshots, export and import, and the folders on d… |

## src/components/Sidebar — 3 файлов, 498 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `folderIcons.ts` | 37 | 7 | FOLDER_ICONS |  |
| `FolderTree.tsx` | 257 | 1 | FolderTree |  |
| `Sidebar.tsx` | 204 | 1 | Sidebar |  |

## src/components/UI — 32 файлов, 5047 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioPlayer.tsx` | 382 | 4 | AudioPlayer |  |
| `AudioRecorder.tsx` | 192 | 2 | AudioRecorder |  |
| `Button.tsx` | 56 | 6 | ButtonProps, Button |  |
| `Checkbox.tsx` | 75 | 2 | CheckboxProps, Checkbox |  |
| `ContextMenu.tsx` | 317 | 1 | ContextMenu |  |
| `DatePickerPopover.tsx` | 233 | 2 | DatePickerPopoverProps, DatePickerPopover |  |
| `EmptyState.tsx` | 31 | 2 | EmptyStateProps, EmptyState |  |
| `IconButton.tsx` | 50 | 6 | IconButtonProps, IconButton |  |
| `ImageLightbox.tsx` | 359 | 3 | ImageLightboxProps, ImageLightbox, LightboxImage |  |
| `LightboxTextPanel.tsx` | 150 | 1 | LightboxTextPanelProps, LightboxTextPanel |  |
| `MarkdownRenderer.tsx` | 185 | 4 | MarkdownRenderer |  |
| `menu/feedMenuSections.tsx` | 82 | 1 | FeedMenuSectionsProps, FeedMenuSections |  |
| `menu/folderMenuSections.tsx` | 88 | 1 | FolderMenuSectionsProps, FolderMenuSections |  |
| `menu/itemMenuSections.tsx` | 205 | 1 | ItemMenuSectionsProps, ItemMenuSections |  |
| `menu/MenuSubmenus.tsx` | 229 | 4 | MenuSubmenuName, MenuSubmenusProps, MenuSubmenus |  |
| `MenuDropdown.tsx` | 188 | 4 | MenuDropdownProps, MenuDropdown |  |
| `MobileActionSheet.tsx` | 186 | 1 | MobileActionSheet |  |
| `NumberInput.tsx` | 98 | 1 | NumberInputProps, NumberInput |  |
| `PriorityBadge.tsx` | 75 | 5 | TaskPriority, LinearSignalBarsProps, LinearSignalBars |  |
| `priorityTone.ts` | 46 | 4 | PriorityTone, priorityTone, PRIORITY_TONE_TEXT, PRIORITY_TONE_DOT, PRIORITY_TONE_CHIP | Цветовая семья приоритета: high — rose, medium — amber, low — blue, none — zi… |
| `ResponsiveSegmented.tsx` | 248 | 7 | SegmentedOption, ResponsiveSegmentedProps, ResponsiveSegmented |  |
| `segmentedVariants.ts` | 55 | 2 | SegmentedVariant, SegmentedStripClasses, SEGMENTED_STRIP_CLASSES | Пресеты классов для `ResponsiveSegmented`. Геометрия сегментных полос живёт |
| `Select.tsx` | 352 | 10 | SelectOption, SelectProps, Select |  |
| `SendButton.tsx` | 48 | 4 | SendButtonProps, SendButton |  |
| `SheetPanel.tsx` | 353 | 2 | SheetPanelApi, SheetPanelProps, SheetPanel |  |
| `TagChip.tsx` | 81 | 5 | TagChipProps, TagChip |  |
| `TaskStatusMark.tsx` | 49 | 4 | TaskStatusMarkProps, TaskStatusMark |  |
| `Toast.tsx` | 172 | 2 | ToastContainer |  |
| `ToolbarButton.tsx` | 58 | 3 | ToolbarButtonProps, ToolbarButton |  |
| `VideoCirclePlayer.tsx` | 142 | 3 | VideoCirclePlayer |  |
| `VideoRecorder.tsx` | 212 | 1 | VideoRecorder |  |
| `WindowControls.tsx` | 50 | 1 | WindowControls | ponytail: fixed top-right 34px controls matching dockview tab row. ceiling: w… |

## src/components/Vault — 1 файлов, 228 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `VaultSwitcherMenu.tsx` | 228 | 3 | VaultSwitcherMenuProps, VaultSwitcherMenu |  |

## src/components/Views — 13 файлов, 2653 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `CalendarDrawer.tsx` | 271 | 1 | CalendarDrawerProps, CalendarDrawer |  |
| `CalendarExpandedDayModal.tsx` | 184 | 1 | CalendarExpandedDayModalProps, CalendarExpandedDayModal |  |
| `calendarHelpers.ts` | 66 | 4 | getPriorityBadge, cleanTimeFromTitle, formatDurationBadge |  |
| `CalendarMonthView.tsx` | 210 | 1 | CalendarMonthViewProps, CalendarMonthView |  |
| `CalendarTaskBlock.tsx` | 339 | 1 | AllDayTaskPillProps, AllDayTaskPill, TimedTaskBlockProps, TimedTaskBlock |  |
| `CalendarView.tsx` | 548 | 1 | CalendarView | The desktop calendar: month and week grids, drag to reschedule, and the overd… |
| `kanban/KanbanCard.tsx` | 218 | 1 | KanbanCardProps, KanbanCard |  |
| `kanban/KanbanColumn.tsx` | 116 | 1 | KanbanColumnProps, KanbanColumn |  |
| `kanban/KanbanMaterialsDock.tsx` | 192 | 1 | KanbanMaterialsDockProps, KanbanMaterialsDock |  |
| `kanban/kanbanModel.ts` | 32 | 5 | KanbanColumnIconType, KanbanColumnConfig, KANBAN_COLUMNS, isOverdue, getTaskKey |  |
| `kanban/KanbanStatusIcon.tsx` | 33 | 2 | KanbanStatusIconProps, KanbanStatusIcon |  |
| `KanbanBoard.tsx` | 168 | 2 | KanbanBoard |  |
| `useCalendarInteractions.ts` | 276 | 1 | DEFAULT_HOUR_HEIGHT, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT, TimelineResizingState, ResizingTaskState, +1 |  |

## src/components/Workspace — 5 файлов, 1504 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `dockPanelUtils.ts` | 216 | 4 | WORKSPACE_LAYOUT_KEY, wsLog, PANELS_TO_ADD, PANEL_CONSTRAINTS, getPanelMinWidth, +5 |  |
| `GroupHeaderActions.tsx` | 110 | 1 | GroupHeaderActions |  |
| `useCrossWindowDnd.ts` | 614 | 1 | DropPreviewRect, DropTargetResult, UseCrossWindowDndOptions, useCrossWindowDnd | Dragging a note between workspace panels: the preview rect, the drop target u… |
| `useDockPanels.ts` | 274 | 1 | UseDockPanelsOptions, useDockPanels |  |
| `WorkspaceShell.tsx` | 290 | 1 | WorkspaceShellProps, WorkspaceShell |  |

## src/config — 8 файлов, 419 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ai.ts` | 86 | 1 | AI_ENDPOINTS, DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT, AI_LIMITS, AI_STOP_TAGS, +1 |  |
| `index.ts` | 7 | 84 | * from ./storage, * from ./sync, * from ./ai, * from ./search, * from ./ui, +1 |  |
| `search.ts` | 9 | 1 | SEARCH_LIMITS |  |
| `settingsTabs.ts` | 33 | 4 | SettingsTabId, SettingsTabDefinition, SETTINGS_TABS, settingsTabLabel |  |
| `storage.ts` | 95 | 2 | DEFAULT_INBOX_FOLDER, STORAGE_KEYS, DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_VAULT_META, +1 |  |
| `sync.ts` | 44 | 1 | DEFAULT_SYNC_SERVER_URL, OFFICIAL_SYNC_DOMAINS, SYNC_STORAGE_KEYS, SYNC_INTERVALS, SYNC_ATTACHMENT_MAX_BYTES, +1 |  |
| `typography.ts` | 81 | 3 | FontFamilyOption, FONT_FAMILY_OPTIONS, FontScaleOption, FONT_SCALE_OPTIONS, getFontScaleMultiplier, +1 |  |
| `ui.ts` | 64 | 2 | ACCENT_COLORS, UI_BREAKPOINTS, UI_LAYOUT, UI_DELAYS, UI_GESTURES | Accent presets, not a free picker: one hex repaints the whole accent family in |

## src/context — 2 файлов, 943 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AppContext.tsx` | 715 | 62 | AppContext, AppProvider, useApp, ToastMessage, AttachSheetRequest, +1 | oxlint-disable react/only-export-components |
| `appContext.types.ts` | 228 | 8 | ToastMessage, AttachSheetRequest, ContextMenuTarget, AppContextType | The contract AppContext exposes to every consumer, plus the shapes the UI |

## src/context/feed — 1 файлов, 89 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `feedView.ts` | 89 | 1 | FeedViewQuery, selectVisibleItems | Which records the feed shows, and in what order. |

## src/context/hooks — 10 файлов, 1490 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAppearance.ts` | 94 | 1 | useAppearance | How the app looks: density, font, accent. |
| `useAssistant.ts` | 139 | 1 | useAssistant | The assistant session: the transcript, the model it talks to, and one send. |
| `useBackup.ts` | 145 | 1 | useBackup | Backup and restore: snapshots on disk, the manual one, the zip round trip. |
| `useFeedView.ts` | 215 | 1 | useFeedView | How the feed is looking: which folder, which view, which filters, which order. |
| `useFolderAdmin.ts` | 101 | 1 | useFolderAdmin | What a folder itself can do: save, describe, rename, delete, and the create m… |
| `useItemWrites.ts` | 223 | 1 | ItemWritesDeps, useItemWrites | Every write to a note: create, save, delete, restore from trash, move, comple… |
| `useMobileNav.ts` | 130 | 1 | DEFAULT_MOBILE_DOCK_TABS, useMobileNav |  |
| `useOverlays.ts` | 235 | 1 | useOverlays | Everything that lives on top of the app: modals, lightbox, context menu, toas… |
| `useRecurringRollover.ts` | 63 | 1 | useRecurringRollover | Recurring tasks roll over on their own schedule: at midnight, and when the tab |
| `useVaults.ts` | 145 | 1 | useVaults | What a vault can do: switch to it, create it, delete it, pick its folder on d… |

## src/hooks — 3 файлов, 683 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useCalendarSchedule.ts` | 127 | 3 | CalendarTask, UseCalendarScheduleParams, CalendarScheduleResult, useCalendarSchedule |  |
| `useItemActions.ts` | 280 | 4 | PRIORITY_LABELS, TYPE_LABELS, useItemActions |  |
| `useSuggestedActions.ts` | 276 | 1 | ActionHistoryEntry, useSuggestedActions |  |

## src/hooks/gestures — 6 файлов, 1091 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useDragToScroll.ts` | 232 | 2 | DragToScrollOptions, useDragToScroll |  |
| `usePhotoPager.ts` | 320 | 2 | PhotoPagerOptions, usePhotoPager |  |
| `usePointerDnd.ts` | 244 | 5 | DragItemPayload, UsePointerDndOptions, PointerDndState, usePointerDnd |  |
| `usePullToSearch.ts` | 88 | 1 | usePullToSearch | Pull a list past either end to open search. |
| `useSheetDrag.ts` | 157 | 1 | useSheetDrag | Drag-to-dismiss for a one-detent sheet — a content-sized panel with nothing t… |
| `useSwipeGesture.ts` | 50 | 2 | SwipeGestureOptions, useSwipeGesture |  |

## src/hooks/layout — 5 файлов, 282 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useComposerInset.ts` | 38 | 2 | useComposerInset | Height of the dock the composer sits in. |
| `useEditorPaneRect.ts` | 58 | 1 | EditorPaneRect, useEditorPaneRect |  |
| `useFlipLayout.ts` | 96 | 2 | useFlipLayout | Layout motion for a list, driven by whatever `signature` the caller passes. |
| `useIsMobile.ts` | 35 | 2 | useIsMobile | Hook to detect mobile screens (< 768px by default). |
| `useVisualViewportHeight.ts` | 55 | 1 | useVisualViewportHeight | Publishes the visual viewport height as `--vvh`. |

## src/hooks/media — 3 файлов, 341 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAttachmentSrc.ts` | 50 | 11 | AttachmentSrcs, useAttachmentSrcs, useAttachmentSrc |  |
| `useAudioAnalyser.ts` | 88 | 1 | useAudioAnalyser | Owns the Web Audio graph for one `<audio>` element. |
| `useComposerMedia.ts` | 203 | 1 | UseComposerMediaOptions, useComposerMedia |  |

## src/hooks/ui — 3 файлов, 268 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useGlobalHotkeys.ts` | 54 | 1 | useGlobalHotkeys |  |
| `useLayerStack.ts` | 122 | 1 | AppLayer, useLayerStack |  |
| `usePresence.ts` | 92 | 29 | usePresence | Keeps the existing DOM during exit. CSS owns the duration and destination. |

## src/lib — 5 файлов, 1386 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `backupService.ts` | 606 | 1 | SlagManifest, BackupService, backupService, DEFAULT_BACKUP_SETTINGS | Vault snapshots: pack a zip, list what is there, restore one, drop old ones. |
| `commands.ts` | 279 | 3 | CommandCategory, AppCommandContext, AppCommand, isMac, formatShortcut, +3 | ponytail: central command & hotkey engine for SLAG v2 without external depend… |
| `motion.ts` | 195 | 9 | MotionToken, MotionEase, prefersReducedMotion, motionMs, motionEase, +7 |  |
| `navigation.ts` | 13 | 6 | navigatePage | Единственная точка перехода между страницами приложения (?page=…). |
| `searchService.ts` | 293 | 3 | preloadSearchEngine, getSearchableAttachmentText, initSearchIndex, querySearch | Orama lives in its own lazy chunk (~76 kB, 25 kB gzip). On the 1000-note prob… |

## src/lib/ai — 23 файлов, 4423 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `actionParser.ts` | 375 | 3 | cleanSnippetText, extractActionBlock |  |
| `adapters/anthropicAdapter.ts` | 175 | 1 | AnthropicMessagesAdapter |  |
| `adapters/errorMessage.ts` | 19 | 3 | extractErrorMessage | One answer to "what did the provider actually say". |
| `adapters/openAiAdapter.ts` | 209 | 1 | OpenAiChatAdapter |  |
| `adapters/openAiResponsesAdapter.ts` | 210 | 1 | OpenAiResponsesAdapter |  |
| `aiClient.ts` | 231 | 2 | AiResolvedTarget, PromptRequest, PromptResult, resolveKieEndpoint, resolveAiTarget, +4 |  |
| `aiService.ts` | 428 | 7 | CategorizeResult, TriageSuggestion, TriageProgress, TriageProgressCallback, categorizeDraft, +4 |  |
| `appGuide.ts` | 243 | 2 | APP_GUIDE_TOPICS, AppGuideTopic, getAppGuideContent | ponytail: curated topic catalog for in-app assistant UI navigation & feature … |
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
| `orchestrator.ts` | 405 | 1 | AssistantOrchestrator, assistantOrchestrator, resolveKieEndpoint, resolveAiTarget, extractActionBlock, +3 |  |
| `prompt.ts` | 156 | 1 | buildSystemPrompt |  |
| `toolDefinitions.ts` | 171 | 1 | getCanonicalTools |  |
| `tools.ts` | 442 | 1 | createLocalToolExecutor | The tools the assistant may call: search notes, read one, and report on the v… |
| `types.ts` | 74 | 15 | AssistantToolDefinition, AdapterTurnHistoryItem, LlmAdapterTurnRequest, LlmAdapterTurnResponse, LlmProtocolAdapter, +2 |  |

## src/lib/logger — 2 файлов, 653 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `logger.ts` | 588 | 44 | LogListener, logger | The log: levels, scopes, listeners, the buffer, retention and persistence. Wh… |
| `logRedaction.ts` | 65 | 1 | maskSensitiveString, sanitizeForLog | Masking secrets in log messages and payloads; the one place that knows what a… |

## src/lib/media — 10 файлов, 1657 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentEnrichment.ts` | 600 | 4 | resolveRelayMedia, canEnrichAttachments, buildImageInstruction, extractFocalContext, dataUrlToBlob, +3 | Subscription mode routes images and audio through the relay: the Groq key liv… |
| `audioHelper.ts` | 186 | 10 | AudioTrack, AudioScopeMode, AudioTypeFilter, detectAudioFormat, splitAudioName, +6 |  |
| `audioSpectrum.ts` | 439 | 3 | OrbFeatures, ORB_SILENCE, ORB_FFT_SIZE, createSpectrumReader | Features for the liquid orb. |
| `blobToDataUrl.ts` | 16 | 3 | blobToDataUrl | A blob as a `data:` URL. |
| `byteCodec.ts` | 16 | 3 | bytesToBase64, base64ToBytes, toArrayBuffer |  |
| `deviceGallery.ts` | 38 | 1 | getGalleryAccess, requestGalleryAccess, listDeviceMedia, DeviceMediaItem, DeviceMediaKind |  |
| `fileDropHelper.ts` | 115 | 4 | MAX_ATTACHMENT_BYTES, attachmentType, attachmentFromDataUrl, processFileListToAttachments | What the storage layer takes inline without turning into a memory problem. |
| `folderBrowser.ts` | 128 | 4 | listFolders, pickFolder, listFolderEntries, pickFilesFromSystem, readEntryBytes, +3 | Folders the person already granted; the grant survives restarts and app updat… |
| `imageCodec.ts` | 90 | 2 | EncodedImage, ImageEncodeOptions, STORED_IMAGE_MAX_DIM, STORED_IMAGE_QUALITY, UNCOMPRESSIBLE_IMAGE_TYPES, +3 |  |
| `mediaEvents.ts` | 29 | 3 | bindMediaEvents | One list of media-element events, bound and unbound in one move. A player that |

## src/lib/platform — 3 файлов, 551 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `folderOpener.ts` | 72 | 5 | OpenFolderResult, openAppFolder |  |
| `platform.ts` | 86 | 2 | isTauriEnvironment, PlatformInfo, getPlatformInfo, setupSystemHotkey, removeSystemHotkey |  |
| `windowControls.ts` | 393 | 13 | isMobilePlatform, isDesktopApp, isPrimaryWindow, minimizeWindow, toggleMaximizeWindow, +15 |  |

## src/lib/storage — 10 файлов, 2597 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentData.ts` | 21 | 3 | stripAttachmentList, stripAttachmentData | Attachments as they belong in the localStorage index: metadata only. |
| `attachments.ts` | 230 | 3 | AttachmentStore |  |
| `folderStore.ts` | 171 | 1 | FolderStoreHost, folderStorageKey, readFolders, writeFolder, renameFolderTree, +2 | Writing folders: save, rename with the note cascade, describe, delete and re-… |
| `index.ts` | 701 | 34 | StorageChangeEvent, StorageChangeListener, StorageService, storage, VaultStats, +4 | The one door to the vault: notes, cache and change events, and delegation to … |
| `indexedDb.ts` | 146 | 3 | idbSaveAttachment, idbGetAttachment, idbGetAllAttachments, StoredSnapshotRecord, idbSaveSnapshot, +3 |  |
| `settingsStore.ts` | 449 | 1 | SettingsStoreHost, draftsStorageKey, workspaceStateStorageKey, flushDraftWrites, installDraftFlushGuards, +16 | Small settings and drafts: which localStorage keys are kept and how they are … |
| `trashStore.ts` | 80 | 1 | TrashStoreHost, trashStorageKey, readTrash, trashItem, recoverFromTrash |  |
| `vaultFiles.ts` | 498 | 1 | VaultFilesDeps, VaultFiles | The vault as files on disk: where they live, how a name is claimed, how a not… |
| `vaultRegistry.ts` | 199 | 1 | VaultRegistryHost, initCurrentVault, getVaults, saveVaultMeta, ensureVaultSyncId, +4 | Which vault the app is looking at: the registry kept in localStorage, and the… |
| `vaultTransfer.ts` | 102 | 1 | VaultSnapshot, buildVaultExportJson, VaultImportIo, VaultImportPayload, importVaultPayload, +1 |  |

## src/lib/sync — 23 файлов, 6093 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `account.ts` | 570 | 19 | accountClient, generateMnemonic, AccountDevice, AccountDeviceInput, AccountInfo, +6 | The sync account: session and sign-in, what the plan is, and the device ident… |
| `accountCrypto.ts` | 257 | 5 | AccountIdentity, generateAccountIdentity, signDeviceChallenge, getOrCreateDeviceIdentity, renameStoredDevice, +3 |  |
| `accountTypes.ts` | 90 | 11 | AccountInfo, AccountDevice, VaultGrant, AccountVault, VaultInvitation, +5 |  |
| `applyBundle.ts` | 327 | 1 | persistIncomingBundle | What a bundle from the relay actually does to the vault: tombstones, staged |
| `attachmentSignature.ts` | 6 | 2 | attachmentSignature |  |
| `bip39Words.ts` | 2052 | 1 | BIP39_WORDS | Standard BIP-39 English wordlist (2048 words) |
| `crypto.ts` | 181 | 10 | generateMnemonic, validateMnemonic, deriveVaultKey, deriveRoomId, encryptBundle, +5 | Generates a cryptographically secure 12-word recovery seed phrase |
| `deviceAdmin.ts` | 61 | 1 | DeviceAdminHost, applyAccountDevices, addTrustedDevice, setDeviceAllowedVaults, removeTrustedDevice, +2 | Who may read this vault: the trusted-device list mirrored into the sync confi… |
| `devices.ts` | 218 | 3 | normalizeTrustedDevice, touchDeviceLastSeen, normalizeTrustedDevicesFromAccount, computeSubscription, createDefaultDeviceName, +7 |  |
| `entities/registry.ts` | 35 | 1 | createSyncOpFromStorageEvent |  |
| `entities/types.ts` | 16 | 2 | SyncEntityKind, SyncAction, SyncOperation |  |
| `index.ts` | 5 | 2 | * from ./types, * from ./crypto, * from ./pairing, * from ./syncEngine |  |
| `localBookkeeping.ts` | 80 | 3 | SyncScope, stateHashKey, syncedIdsKey, tombstonesKey, sentHashesKey, +5 |  |
| `outbox/outbox.ts` | 58 | 1 | Outbox |  |
| `pairing.ts` | 170 | 2 | createPairingSession, claimPairingSession, approvePairingSession, approveAccountPairingSession, rejectPairingSession, +2 | Creates a new 5-minute pairing session with a 6-digit PIN on the relay server |
| `pushBundle.ts` | 292 | 1 | pushLocalChanges | Packing the local state into an outgoing bundle: what is dirty, what was alre… |
| `syncConfig.ts` | 140 | 2 | SyncConfigHost, computeSubscription, loadConfig, saveConfig, authHeaders, +3 | Where the sync config lives per vault, how requests are authorized, how a see… |
| `syncEngine.ts` | 881 | 17 | PendingPush, SyncEngine, syncEngine, storage, accountClient |  |
| `syncSocket.ts` | 41 | 1 | SyncSocketHost, connectSocket, handleIncoming, acknowledgeBundle | The live socket: open it for the current room, accept a frame, acknowledge a … |
| `transport.ts` | 208 | 2 | TransportCallbacks, TransportOptions, SendAckOptions, SyncTransport |  |
| `twoFactorAuth.ts` | 198 | 1 | TotpConfig, WebAuthnConfig, TwoFactorState, base32Encode, base32Decode, +6 | Two-Factor Authentication (2FA) for Zero-Knowledge Vaults |
| `types.ts` | 123 | 23 | DeviceSyncMode, DeviceProfile, SyncConnectionState, SubscriptionInfo, SyncStatus, +8 |  |
| `vaultSharing.ts` | 84 | 4 | getLocalVaultId, shareVaultWithDevice, acceptSharedVault, installSharedVault |  |

## src/lib/tasks — 2 файлов, 144 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `taskCompletion.ts` | 35 | 1 | applyTaskCompletion | keep every local status entry point consistent, without applying transitions … |
| `taskUtils.ts` | 109 | 14 | baseTaskId, parseSubtasksFromContent, toggleCheckboxInContent, setAllCheckboxesInContent, migrateLegacySubtasksToContent, +1 | The calendar projects a recurring task into every occurrence as |

## src/lib/text — 4 файлов, 350 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `chatMarkdown.ts` | 71 | 1 | ChatSegment, splitTaskBlocks |  |
| `diffUtils.ts` | 265 | 1 | WordChunk, SideBySideDiffRow, DiffResult, MetadataDiffItem, computeLineWordDiff, +2 |  |
| `formatBytes.ts` | 7 | 5 | formatBytes |  |
| `shortId.ts` | 7 | 6 | shortId | An id cut down for reading: the head, an ellipsis, the tail. |

## src/lib/time — 4 файлов, 958 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendarLayout.ts` | 138 | 6 | LayoutPositionedTask, TimedBlockBox, timedBlockBox, computeAntiOverlapLayout |  |
| `dateUtils.ts` | 126 | 22 | RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS, getISODateString, getTodayIso, getTomorrowIso, +11 | dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2. |
| `recurrenceHelper.ts` | 305 | 5 | RECURRENCE_PRESETS, parseISODateString, getIsoWeekday, formatRecurrenceLabel, computeNextStrictOccurrenceDate, +4 |  |
| `todoistTaskParser.ts` | 389 | 11 | ParsedTodoistTask, parseTodoistInput, TaskTimeSlot, getTaskTimeSlot, extractAndStripTags, +1 |  |

## src/lib/vault — 10 файлов, 830 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `demoVault.ts` | 238 | 1 | generateDemoItems | Generates a clean, cohesive set of starter demo items across the default fold… |
| `folderItems.ts` | 37 | 3 | itemsInFolder, materialsInFolder | Records that belong to a folder. Inbox is a leaf: it holds only the items that |
| `folderOptions.ts` | 94 | 6 | FolderSelectOption, buildFolderOptions |  |
| `folderPaths.ts` | 38 | 3 | sanitizeFolderName, parentPathOf, folderPathForName, folderPathUnder, isFolderPathFree, +2 | Folder names are file names on disk, so the OS-forbidden characters become da… |
| `itemSchema.ts` | 46 | 1 | PropertySchemaItem, ITEM_MUTABLE_PROPERTIES, ITEM_UPDATES_SCHEMA | Single Source of Truth (SSOT) metadata registry for SlagItem mutable fields. |
| `itemUpdates.ts` | 70 | 2 | applyItemUpdates | Applies a partial update to an item without touching storage. |
| `markdownSerializer.ts` | 198 | 4 | serializeItemToMarkdown, parseMarkdownToItem | Serializes a SlagItem into Markdown with YAML Frontmatter (Obsidian-compatibl… |
| `noteFilename.ts` | 20 | 5 | getSafeNoteFilename, withIdSuffix | ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; … |
| `stats.ts` | 66 | 2 | VaultStats, collectExistingTags, computeVaultStats |  |
| `vaultDisplay.ts` | 23 | 5 | getVaultDisplayName |  |

## src/mcp — 6 файлов, 1297 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 57 | 0 | startMcpServer |  |
| `prompts.ts` | 70 | 2 | registerMcpPrompts |  |
| `resources.ts` | 130 | 2 | registerMcpResources |  |
| `tools.ts` | 379 | 2 | registerMcpTools |  |
| `types.ts` | 82 | 2 | McpVaultConfig, VaultStateData, NoteMatch, SaveNoteSchema, GetNoteSchema, +6 |  |
| `vault.ts` | 579 | 5 | resolveVaultConfig, McpVault, getSafeNoteFilename | The vault as the MCP server sees it: files on disk, frontmatter, attachments … |

## src/types — 2 файлов, 609 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 430 | 162 | SlagItemType, TaskStatus, SlagItemStatus, SlagItemPriority, SlagAttachment, +55 | The domain, in one place: notes, folders, vaults, attachments, sync and AI se… |
| `slashCommands.ts` | 179 | 3 | SlashCommand, SLASH_COMMANDS, CATEGORY_LABELS |  |
