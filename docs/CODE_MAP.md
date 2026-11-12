# CODE_MAP — карта модулей

Сгенерировано `npm run map:code`. Руками не править — перезапишется.
Читай эту карту до того, как грепать: колонка «импортят» показывает,
что модуль реально используется, «что это» — зачем он нужен.

Модулей: **400**, строк: **78929**, зон: **39**.

## Самые длинные файлы

| файл | строк | импортят |
|---|---:|---:|
| `src/lib/sync/bip39Words.ts` | 2052 | 1 |
| `e2e/slag/editor.spec.ts` | 1578 | 0 |
| `src/components/Feed/ItemCard.tsx` | 1151 | 1 |
| `src/components/Mobile/MobileCalendarView.tsx` | 1105 | 3 |
| `src/components/Feed/Composer.tsx` | 1094 | 4 |
| `e2e/slag/views.spec.ts` | 1070 | 0 |
| `e2e/slag/workspace.spec.ts` | 885 | 0 |
| `e2e/mobile.spec.ts` | 868 | 0 |
| `src/lib/sync/syncEngine.ts` | 865 | 17 |
| `e2e/slag/feed.spec.ts` | 802 | 0 |
| `src/context/AppContext.tsx` | 720 | 59 |
| `src/lib/storage/index.ts` | 650 | 33 |
| `src/components/Admin/AdminPanel.tsx` | 646 | 1 |
| `src/components/Editor/FullscreenEditor.tsx` | 639 | 1 |
| `src/components/Views/KanbanBoard.tsx` | 634 | 2 |

## e2e (playwright) — 91 файлов, 16950 строк

Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:

- `e2e/slag/editor.spec.ts` — 1578
- `e2e/slag/views.spec.ts` — 1070
- `e2e/slag/workspace.spec.ts` — 885
- `e2e/mobile.spec.ts` — 868
- `e2e/slag/feed.spec.ts` — 802
- `e2e/admin_panel.spec.ts` — 491
- `e2e/motion.spec.ts` — 443
- `e2e/slag/feed_thumbs.spec.ts` — 351
- `e2e/mcp_server.spec.ts` — 337
- `e2e/assistant_search_sanitization.spec.ts` — 321

## src — 3 файлов, 391 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `App.tsx` | 312 | 1 | App |  |
| `demo.tsx` | 68 | 0 | Playground |  |
| `main.tsx` | 11 | 0 |  |  |

## src/components — 1 файлов, 55 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `InitialSyncBoundary.tsx` | 55 | 1 | InitialSyncBoundary |  |

## src/components/Account — 1 файлов, 349 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountCabinet.tsx` | 349 | 1 | AccountCabinet |  |

## src/components/Admin — 8 файлов, 2490 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AdminPanel.tsx` | 646 | 1 | AdminPanel |  |
| `Charts.tsx` | 333 | 4 | DataPoint, SparklineChart, BarChart, FunnelChart, DistributionGauge |  |
| `tabs/AccountsTab.tsx` | 431 | 1 | AccountsTab |  |
| `tabs/AiTab.tsx` | 195 | 1 | AiTab |  |
| `tabs/BillingTab.tsx` | 329 | 1 | BillingTab |  |
| `tabs/RelayTab.tsx` | 237 | 1 | RelayTab |  |
| `tabs/SecurityTab.tsx` | 71 | 1 | SecurityTab |  |
| `useAdminData.ts` | 248 | 6 | AdminStats, AdminDevice, AdminVault, AdminAccount, BillingStats, +7 | Interfaces from AdminPanel.tsx |

## src/components/Audio — 9 файлов, 1854 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioCoverArt.tsx` | 157 | 1 | AudioCoverArt |  |
| `AudioPanel.tsx` | 280 | 2 | AudioPanel |  |
| `AudioPlaylistDrawer.tsx` | 265 | 1 | AudioPlaylistDrawer |  |
| `liquidOrb.ts` | 418 | 1 | OrbFrame, createOrbRenderer |  |
| `panel/AudioArtwork.tsx` | 73 | 1 | AudioArtwork |  |
| `panel/AudioScrubber.tsx` | 82 | 1 | AudioScrubber |  |
| `panel/AudioTransport.tsx` | 182 | 1 | AudioTransport |  |
| `panel/PlaylistDrawer.tsx` | 63 | 1 | PlaylistDrawer |  |
| `panel/useAudioPlayback.ts` | 334 | 1 | useAudioPlayback |  |

## src/components/Composer — 1 файлов, 102 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `QuickComposerWindow.tsx` | 102 | 1 | QuickComposerWindow |  |

## src/components/Editor — 11 файлов, 2689 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachmentStrip.tsx` | 219 | 1 | AttachmentStripProps, AttachmentStrip |  |
| `EditorToolbar.tsx` | 172 | 1 | EditorToolbar, EditorToolbarProps | Editor toolbar assembly: top row, markdown palette, save/zen actions. |
| `editorToolbarParts.tsx` | 75 | 5 | ITEM_TYPE_OPTIONS, MarkdownDropdown, EditorToolbarProps, EditorTopBarProps, MarkdownPaletteProps | Shared props, options and dropdown state for the editor toolbar halves. |
| `EditorTopBar.tsx` | 61 | 1 | EditorTopBar | Editor top row: back, folder selector, item type. |
| `fullscreen/EditorTaskFields.tsx` | 292 | 1 | EditorTaskFieldsProps, EditorTaskFields |  |
| `fullscreen/useEditorAiActions.ts` | 71 | 1 | EditorAiActionsOptions, useEditorAiActions |  |
| `fullscreen/useEditorAttachments.ts` | 161 | 1 | EditorAttachmentsOptions, useEditorAttachments |  |
| `FullscreenEditor.tsx` | 639 | 1 | FullscreenEditor |  |
| `MarkdownPalette.tsx` | 364 | 1 | MarkdownPalette | Markdown utilities: history, styles, lists, inline formatting, links, attachm… |
| `MobileEditorBar.tsx` | 325 | 1 | MobileEditorBarProps, MobileEditorBar |  |
| `useFullscreenDraft.ts` | 310 | 1 | UseFullscreenDraftOptions, UseFullscreenDraftReturn, useFullscreenDraft |  |

## src/components/Feed — 27 файлов, 6721 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ActiveFilterBadges.tsx` | 198 | 2 | ActiveFilterBadgesProps, ActiveFilterBadges |  |
| `assistant/AssistantActionCard.tsx` | 403 | 1 | AssistantActionCard |  |
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
| `Composer.tsx` | 1094 | 4 | ComposerProps, Composer |  |
| `composer/useComposerFiles.ts` | 155 | 1 | useComposerFiles | Getting files into the composer: picker, drop, paste. |
| `ComposerTaskControls.tsx` | 257 | 1 | ComposerTaskControlsProps, ComposerTaskControls |  |
| `FeedColumnResizer.tsx` | 90 | 1 | FeedColumnResizer | Grab strips on both sides of the reading column. The width is published as |
| `FeedHeader.tsx` | 162 | 1 | FeedHeaderProps, FeedHeader |  |
| `FeedList.tsx` | 633 | 2 | FeedList |  |
| `FolderSuggestionMenu.tsx` | 101 | 1 | FolderSuggestionMenu |  |
| `ItemCard.tsx` | 1151 | 1 | ItemCardProps, ItemCard |  |
| `PinnedBanner.tsx` | 217 | 1 | PinnedBanner |  |
| `SlashCommandMenu.tsx` | 101 | 1 | SlashCommandMenu |  |
| `SuggestionMenuHeader.tsx` | 28 | 4 | SuggestionMenuHeader | Общая шапка подсказок композера (@ папки, # теги, / команды). |
| `SuggestionMenuShell.tsx` | 61 | 4 | SuggestionMenuShell |  |
| `TagSuggestionMenu.tsx` | 75 | 2 | TagMeta, TagSuggestionMenu |  |
| `useComposerAutocomplete.ts` | 395 | 1 | UseComposerAutocompleteOptions, useComposerAutocomplete |  |
| `useComposerDraft.ts` | 416 | 1 | ComposerDraftState, UseComposerDraftOptions, reviveReplyTarget, useComposerDraft |  |

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

## src/components/Landing — 1 файлов, 502 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LandingPage.tsx` | 502 | 1 | LandingPage |  |

## src/components/Logs — 2 файлов, 463 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `LogModal.tsx` | 23 | 2 | LogModal |  |
| `LogViewer.tsx` | 440 | 3 | LogViewer |  |

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

## src/components/Mobile — 10 файлов, 2463 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `MobileAssistantView.tsx` | 71 | 1 | MobileAssistantView |  |
| `MobileAudioView.tsx` | 12 | 1 | MobileAudioView |  |
| `MobileCalendarView.tsx` | 1105 | 3 | MobileCalendarView |  |
| `MobileFloatingDock.tsx` | 159 | 1 | MobileFloatingDockProps, MobileFloatingDock |  |
| `MobileFolderInfoView.tsx` | 70 | 1 | MobileFolderInfoView | Phone container: the profile fills the screen, editing happens in place. |
| `MobileFoldersView.tsx` | 390 | 1 | MobileFoldersView |  |
| `MobileScreenHeader.tsx` | 86 | 5 | MobileScreenHeaderProps, MobileScreenHeader |  |
| `MobileSettingsView.tsx` | 133 | 1 | MobileSettingsView |  |
| `MobileShell.tsx` | 112 | 1 | MobileShell |  |
| `MobileTasksView.tsx` | 325 | 1 | MobileTasksView |  |

## src/components/Modals — 10 файлов, 2357 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `BaseModal.tsx` | 156 | 10 | BaseModalProps, BaseModal |  |
| `ComposerModal.tsx` | 59 | 2 | ComposerModal |  |
| `ConfirmDialog.tsx` | 55 | 1 | ConfirmDialog | The app's own question for irreversible actions. It replaces `window.confirm`… |
| `DiffModal.tsx` | 532 | 1 | DiffModalItemEntry, DiffModalProps, DiffModal |  |
| `FolderInfoModal.tsx` | 94 | 2 | FolderInfoModal |  |
| `FolderModal.tsx` | 166 | 2 | FolderModal |  |
| `FolderViewModal.tsx` | 318 | 2 | FolderViewModal |  |
| `SettingsModal.tsx` | 210 | 2 | SettingsModal | The settings shell: a rail of tabs, the mobile and desktop frames, and the pi… |
| `TriageModal.tsx` | 484 | 1 | TriageModal |  |
| `VaultModal.tsx` | 283 | 2 | VaultModal |  |

## src/components/RightPanel — 3 файлов, 446 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderInfoPanel.tsx` | 18 | 1 | FolderInfoPanel | Dock panel container: the same profile, laid out for a narrow column. |
| `FolderMediaTabs.tsx` | 311 | 1 | FolderMediaTabsProps, FolderMediaTabs |  |
| `useFolderMedia.ts` | 117 | 4 | FolderMediaData, useFolderMedia |  |

## src/components/Search — 1 файлов, 444 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SearchModal.tsx` | 444 | 3 | SearchModal |  |

## src/components/Settings — 16 файлов, 2276 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountSettingsTab.tsx` | 66 | 1 | AccountSettingsTab | Первый раздел настроек: кто я, сколько места и куда идти за остальным. |
| `AiSettingsTab.tsx` | 300 | 1 | AiSettingsTab | Where the model comes from: the SLAG subscription or your own key, and what i… |
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
| `UiSettingsTab.tsx` | 115 | 1 | UiSettingsTab | How it looks: accent, fonts, density, panel widths and the mobile dock. |
| `VaultSettingsTab.tsx` | 220 | 1 | VaultSettingsTab | The vault itself: backups, snapshots, export and import, and the folders on d… |

## src/components/Sidebar — 3 файлов, 498 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `folderIcons.ts` | 37 | 7 | FOLDER_ICONS |  |
| `FolderTree.tsx` | 257 | 1 | FolderTree |  |
| `Sidebar.tsx` | 204 | 1 | Sidebar |  |

## src/components/UI — 30 файлов, 4886 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioPlayer.tsx` | 388 | 4 | AudioPlayer |  |
| `AudioRecorder.tsx` | 192 | 2 | AudioRecorder |  |
| `Button.tsx` | 56 | 6 | ButtonProps, Button |  |
| `Checkbox.tsx` | 75 | 2 | CheckboxProps, Checkbox |  |
| `ContextMenu.tsx` | 317 | 1 | ContextMenu |  |
| `DatePickerPopover.tsx` | 233 | 2 | DatePickerPopoverProps, DatePickerPopover |  |
| `EmptyState.tsx` | 31 | 2 | EmptyStateProps, EmptyState |  |
| `IconButton.tsx` | 50 | 6 | IconButtonProps, IconButton |  |
| `ImageLightbox.tsx` | 352 | 3 | ImageLightboxProps, ImageLightbox, LightboxImage |  |
| `LightboxTextPanel.tsx` | 150 | 1 | LightboxTextPanelProps, LightboxTextPanel |  |
| `MarkdownRenderer.tsx` | 185 | 3 | MarkdownRenderer |  |
| `menu/feedMenuSections.tsx` | 82 | 1 | FeedMenuSectionsProps, FeedMenuSections |  |
| `menu/folderMenuSections.tsx` | 88 | 1 | FolderMenuSectionsProps, FolderMenuSections |  |
| `menu/itemMenuSections.tsx` | 205 | 1 | ItemMenuSectionsProps, ItemMenuSections |  |
| `menu/MenuSubmenus.tsx` | 229 | 4 | MenuSubmenuName, MenuSubmenusProps, MenuSubmenus |  |
| `MenuDropdown.tsx` | 188 | 4 | MenuDropdownProps, MenuDropdown |  |
| `MobileActionSheet.tsx` | 186 | 1 | MobileActionSheet |  |
| `NumberInput.tsx` | 98 | 1 | NumberInputProps, NumberInput |  |
| `PriorityBadge.tsx` | 75 | 5 | TaskPriority, LinearSignalBarsProps, LinearSignalBars |  |
| `ResponsiveSegmented.tsx` | 186 | 5 | SegmentedOption, ResponsiveSegmentedProps, ResponsiveSegmented |  |
| `Select.tsx` | 352 | 10 | SelectOption, SelectProps, Select |  |
| `SendButton.tsx` | 48 | 4 | SendButtonProps, SendButton |  |
| `SheetPanel.tsx` | 353 | 2 | SheetPanelApi, SheetPanelProps, SheetPanel |  |
| `TagChip.tsx` | 81 | 4 | TagChipProps, TagChip |  |
| `TaskStatusMark.tsx` | 49 | 3 | TaskStatusMarkProps, TaskStatusMark |  |
| `Toast.tsx` | 172 | 2 | ToastContainer |  |
| `ToolbarButton.tsx` | 58 | 2 | ToolbarButtonProps, ToolbarButton |  |
| `VideoCirclePlayer.tsx` | 145 | 3 | VideoCirclePlayer |  |
| `VideoRecorder.tsx` | 212 | 1 | VideoRecorder |  |
| `WindowControls.tsx` | 50 | 1 | WindowControls | ponytail: fixed top-right 34px controls matching dockview tab row. ceiling: w… |

## src/components/Vault — 1 файлов, 228 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `VaultSwitcherMenu.tsx` | 228 | 3 | VaultSwitcherMenuProps, VaultSwitcherMenu |  |

## src/components/Views — 8 файлов, 2521 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `CalendarDrawer.tsx` | 271 | 1 | CalendarDrawerProps, CalendarDrawer |  |
| `CalendarExpandedDayModal.tsx` | 183 | 1 | CalendarExpandedDayModalProps, CalendarExpandedDayModal |  |
| `calendarHelpers.ts` | 63 | 4 | getPriorityBadge, cleanTimeFromTitle, formatDurationBadge |  |
| `CalendarMonthView.tsx` | 209 | 1 | CalendarMonthViewProps, CalendarMonthView |  |
| `CalendarTaskBlock.tsx` | 339 | 1 | AllDayTaskPillProps, AllDayTaskPill, TimedTaskBlockProps, TimedTaskBlock |  |
| `CalendarView.tsx` | 547 | 1 | CalendarView |  |
| `KanbanBoard.tsx` | 634 | 2 | KanbanBoard |  |
| `useCalendarInteractions.ts` | 275 | 1 | DEFAULT_HOUR_HEIGHT, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT, TimelineResizingState, ResizingTaskState, +1 |  |

## src/components/Workspace — 5 файлов, 1502 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `dockPanelUtils.ts` | 216 | 4 | WORKSPACE_LAYOUT_KEY, wsLog, PANELS_TO_ADD, PANEL_CONSTRAINTS, getPanelMinWidth, +5 |  |
| `GroupHeaderActions.tsx` | 110 | 1 | GroupHeaderActions |  |
| `useCrossWindowDnd.ts` | 612 | 1 | DropPreviewRect, DropTargetResult, UseCrossWindowDndOptions, useCrossWindowDnd |  |
| `useDockPanels.ts` | 274 | 1 | UseDockPanelsOptions, useDockPanels |  |
| `WorkspaceShell.tsx` | 290 | 1 | WorkspaceShellProps, WorkspaceShell |  |

## src/config — 8 файлов, 419 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ai.ts` | 86 | 1 | AI_ENDPOINTS, DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT, AI_LIMITS, AI_STOP_TAGS, +1 |  |
| `index.ts` | 7 | 85 | * from ./storage, * from ./sync, * from ./ai, * from ./search, * from ./ui, +1 |  |
| `search.ts` | 9 | 1 | SEARCH_LIMITS |  |
| `settingsTabs.ts` | 33 | 4 | SettingsTabId, SettingsTabDefinition, SETTINGS_TABS, settingsTabLabel |  |
| `storage.ts` | 95 | 2 | DEFAULT_INBOX_FOLDER, STORAGE_KEYS, DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_VAULT_META, +1 |  |
| `sync.ts` | 44 | 1 | DEFAULT_SYNC_SERVER_URL, OFFICIAL_SYNC_DOMAINS, SYNC_STORAGE_KEYS, SYNC_INTERVALS, SYNC_ATTACHMENT_MAX_BYTES, +1 |  |
| `typography.ts` | 81 | 3 | FontFamilyOption, FONT_FAMILY_OPTIONS, FontScaleOption, FONT_SCALE_OPTIONS, getFontScaleMultiplier, +1 |  |
| `ui.ts` | 64 | 2 | ACCENT_COLORS, UI_BREAKPOINTS, UI_LAYOUT, UI_DELAYS, UI_GESTURES | Accent presets, not a free picker: one hex repaints the whole accent family in |

## src/context — 2 файлов, 952 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AppContext.tsx` | 720 | 59 | AppContext, AppProvider, useApp, ToastMessage, AttachSheetRequest, +1 | oxlint-disable react/only-export-components |
| `appContext.types.ts` | 232 | 7 | ToastMessage, AttachSheetRequest, ContextMenuTarget, AppContextType | The contract AppContext exposes to every consumer, plus the shapes the UI |

## src/context/feed — 1 файлов, 89 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `feedView.ts` | 89 | 1 | FeedViewQuery, selectVisibleItems | Which records the feed shows, and in what order. |

## src/context/hooks — 10 файлов, 1515 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAppearance.ts` | 119 | 1 | useAppearance | How the app looks: panel widths, density, font, accent. |
| `useAssistant.ts` | 139 | 1 | useAssistant | The assistant session: the transcript, the model it talks to, and one send. |
| `useBackup.ts` | 145 | 1 | useBackup | Backup and restore: snapshots on disk, the manual one, the zip round trip. |
| `useFeedView.ts` | 215 | 1 | useFeedView | How the feed is looking: which folder, which view, which filters, which order. |
| `useFolderAdmin.ts` | 101 | 1 | useFolderAdmin | What a folder itself can do: save, describe, rename, delete, and the create m… |
| `useItemWrites.ts` | 223 | 1 | ItemWritesDeps, useItemWrites | Every write to a note: create, save, delete, restore from trash, move, comple… |
| `useMobileNav.ts` | 130 | 1 | DEFAULT_MOBILE_DOCK_TABS, useMobileNav |  |
| `useOverlays.ts` | 235 | 1 | useOverlays | Everything that lives on top of the app: modals, lightbox, context menu, toas… |
| `useRecurringRollover.ts` | 63 | 1 | useRecurringRollover | Recurring tasks roll over on their own schedule: at midnight, and when the tab |
| `useVaults.ts` | 145 | 1 | useVaults | What a vault can do: switch to it, create it, delete it, pick its folder on d… |

## src/hooks — 9 файлов, 1292 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAttachmentSrc.ts` | 50 | 6 | AttachmentSrcs, useAttachmentSrcs, useAttachmentSrc |  |
| `useAudioAnalyser.ts` | 88 | 1 | useAudioAnalyser | Owns the Web Audio graph for one `<audio>` element. |
| `useCalendarSchedule.ts` | 127 | 2 | CalendarTask, UseCalendarScheduleParams, CalendarScheduleResult, useCalendarSchedule |  |
| `useComposerMedia.ts` | 203 | 1 | UseComposerMediaOptions, useComposerMedia |  |
| `useGlobalHotkeys.ts` | 54 | 1 | useGlobalHotkeys |  |
| `useItemActions.ts` | 280 | 4 | PRIORITY_LABELS, TYPE_LABELS, useItemActions |  |
| `useLayerStack.ts` | 122 | 1 | AppLayer, useLayerStack |  |
| `usePresence.ts` | 92 | 29 | usePresence | Keeps the existing DOM during exit. CSS owns the duration and destination. |
| `useSuggestedActions.ts` | 276 | 1 | ActionHistoryEntry, useSuggestedActions |  |

## src/hooks/gestures — 6 файлов, 1091 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useDragToScroll.ts` | 232 | 2 | DragToScrollOptions, useDragToScroll |  |
| `usePhotoPager.ts` | 320 | 2 | PhotoPagerOptions, usePhotoPager |  |
| `usePointerDnd.ts` | 244 | 2 | DragItemPayload, UsePointerDndOptions, PointerDndState, usePointerDnd |  |
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

## src/lib — 18 файлов, 3432 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `aiService.ts` | 428 | 6 | CategorizeResult, TriageSuggestion, TriageProgress, TriageProgressCallback, categorizeDraft, +4 |  |
| `backupService.ts` | 605 | 1 | SlagManifest, BackupService, backupService, DEFAULT_BACKUP_SETTINGS |  |
| `blobToDataUrl.ts` | 16 | 3 | blobToDataUrl | A blob as a `data:` URL. |
| `chatMarkdown.ts` | 71 | 1 | ChatSegment, splitTaskBlocks |  |
| `commands.ts` | 279 | 3 | CommandCategory, AppCommandContext, AppCommand, isMac, formatShortcut, +3 | ponytail: central command & hotkey engine for SLAG v2 without external depend… |
| `diffUtils.ts` | 265 | 1 | WordChunk, SideBySideDiffRow, DiffResult, MetadataDiffItem, computeLineWordDiff, +2 |  |
| `folderOpener.ts` | 72 | 5 | OpenFolderResult, openAppFolder |  |
| `formatBytes.ts` | 7 | 5 | formatBytes |  |
| `logger.ts` | 586 | 43 | LogListener, logger |  |
| `logRedaction.ts` | 65 | 1 | maskSensitiveString, sanitizeForLog | Masking secrets in log messages and payloads; the one place that knows what a… |
| `motion.ts` | 195 | 9 | MotionToken, MotionEase, prefersReducedMotion, motionMs, motionEase, +7 |  |
| `navigation.ts` | 13 | 6 | navigatePage | Единственная точка перехода между страницами приложения (?page=…). |
| `platform.ts` | 86 | 2 | isTauriEnvironment, PlatformInfo, getPlatformInfo, setupSystemHotkey, removeSystemHotkey |  |
| `searchService.ts` | 192 | 3 | getSearchableAttachmentText, initSearchIndex, querySearch |  |
| `taskCompletion.ts` | 35 | 1 | applyTaskCompletion | keep every local status entry point consistent, without applying transitions … |
| `taskUtils.ts` | 101 | 10 | parseSubtasksFromContent, toggleCheckboxInContent, setAllCheckboxesInContent, migrateLegacySubtasksToContent, PRIORITY_LABELS | Extracts subtasks from markdown checkboxes: `- [ ] title` or `- [x] title`. |
| `vaultDisplay.ts` | 23 | 5 | getVaultDisplayName |  |
| `windowControls.ts` | 393 | 13 | isMobilePlatform, isDesktopApp, isPrimaryWindow, minimizeWindow, toggleMaximizeWindow, +15 |  |

## src/lib/ai — 22 файлов, 3991 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `actionParser.ts` | 375 | 3 | cleanSnippetText, extractActionBlock |  |
| `adapters/anthropicAdapter.ts` | 175 | 1 | AnthropicMessagesAdapter |  |
| `adapters/errorMessage.ts` | 19 | 3 | extractErrorMessage | One answer to "what did the provider actually say". |
| `adapters/openAiAdapter.ts` | 209 | 1 | OpenAiChatAdapter |  |
| `adapters/openAiResponsesAdapter.ts` | 207 | 1 | OpenAiResponsesAdapter |  |
| `aiClient.ts` | 231 | 2 | AiResolvedTarget, PromptRequest, PromptResult, resolveKieEndpoint, resolveAiTarget, +4 |  |
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
| `tools.ts` | 441 | 1 | createLocalToolExecutor |  |
| `types.ts` | 74 | 15 | AssistantToolDefinition, AdapterTurnHistoryItem, LlmAdapterTurnRequest, LlmAdapterTurnResponse, LlmProtocolAdapter, +2 |  |

## src/lib/media — 8 файлов, 1611 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentEnrichment.ts` | 599 | 4 | resolveRelayMedia, canEnrichAttachments, buildImageInstruction, extractFocalContext, dataUrlToBlob, +3 | Subscription mode routes images and audio through the relay: the Groq key liv… |
| `audioHelper.ts` | 186 | 10 | AudioTrack, AudioScopeMode, AudioTypeFilter, detectAudioFormat, splitAudioName, +6 |  |
| `audioSpectrum.ts` | 439 | 3 | OrbFeatures, ORB_SILENCE, ORB_FFT_SIZE, createSpectrumReader | Features for the liquid orb. |
| `byteCodec.ts` | 16 | 3 | bytesToBase64, base64ToBytes, toArrayBuffer |  |
| `deviceGallery.ts` | 38 | 1 | getGalleryAccess, requestGalleryAccess, listDeviceMedia, DeviceMediaItem, DeviceMediaKind |  |
| `fileDropHelper.ts` | 115 | 4 | MAX_ATTACHMENT_BYTES, attachmentType, attachmentFromDataUrl, processFileListToAttachments | What the storage layer takes inline without turning into a memory problem. |
| `folderBrowser.ts` | 128 | 4 | listFolders, pickFolder, listFolderEntries, pickFilesFromSystem, readEntryBytes, +3 | Folders the person already granted; the grant survives restarts and app updat… |
| `imageCodec.ts` | 90 | 2 | EncodedImage, ImageEncodeOptions, STORED_IMAGE_MAX_DIM, STORED_IMAGE_QUALITY, UNCOMPRESSIBLE_IMAGE_TYPES, +3 |  |

## src/lib/storage — 10 файлов, 2317 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentData.ts` | 21 | 3 | stripAttachmentList, stripAttachmentData | Attachments as they belong in the localStorage index: metadata only. |
| `attachments.ts` | 205 | 3 | AttachmentStore |  |
| `draftStore.ts` | 248 | 1 | DraftStore |  |
| `folderStore.ts` | 171 | 1 | FolderStoreHost, folderStorageKey, readFolders, writeFolder, renameFolderTree, +2 | Writing folders: save, rename with the note cascade, describe, delete and re-… |
| `index.ts` | 650 | 33 | StorageChangeEvent, StorageChangeListener, StorageService, storage, VaultStats, +4 |  |
| `indexedDb.ts` | 143 | 3 | idbSaveAttachment, idbGetAttachment, idbGetAllAttachments, StoredSnapshotRecord, idbSaveSnapshot, +3 |  |
| `trashStore.ts` | 80 | 1 | TrashStoreHost, trashStorageKey, readTrash, trashItem, recoverFromTrash |  |
| `vaultFiles.ts` | 498 | 1 | VaultFilesDeps, VaultFiles | The vault as files on disk: where they live, how a name is claimed, how a not… |
| `vaultRegistry.ts` | 199 | 1 | VaultRegistryHost, initCurrentVault, getVaults, saveVaultMeta, ensureVaultSyncId, +4 | Which vault the app is looking at: the registry kept in localStorage, and the… |
| `vaultTransfer.ts` | 102 | 1 | VaultSnapshot, buildVaultExportJson, VaultImportIo, VaultImportPayload, importVaultPayload, +1 |  |

## src/lib/sync — 22 файлов, 6006 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `account.ts` | 569 | 18 | accountClient, generateMnemonic, AccountDevice, AccountDeviceInput, AccountInfo, +6 |  |
| `accountCrypto.ts` | 257 | 5 | AccountIdentity, generateAccountIdentity, signDeviceChallenge, getOrCreateDeviceIdentity, renameStoredDevice, +3 |  |
| `accountTypes.ts` | 90 | 11 | AccountInfo, AccountDevice, VaultGrant, AccountVault, VaultInvitation, +5 |  |
| `applyBundle.ts` | 318 | 1 | persistIncomingBundle | What a bundle from the relay actually does to the vault: tombstones, staged |
| `attachmentSignature.ts` | 6 | 2 | attachmentSignature |  |
| `bip39Words.ts` | 2052 | 1 | BIP39_WORDS | Standard BIP-39 English wordlist (2048 words) |
| `crypto.ts` | 181 | 10 | generateMnemonic, validateMnemonic, deriveVaultKey, deriveRoomId, encryptBundle, +5 | Generates a cryptographically secure 12-word recovery seed phrase |
| `devices.ts` | 218 | 3 | normalizeTrustedDevice, touchDeviceLastSeen, normalizeTrustedDevicesFromAccount, computeSubscription, createDefaultDeviceName, +7 |  |
| `entities/registry.ts` | 35 | 1 | createSyncOpFromStorageEvent |  |
| `entities/types.ts` | 16 | 2 | SyncEntityKind, SyncAction, SyncOperation |  |
| `index.ts` | 5 | 2 | * from ./types, * from ./crypto, * from ./pairing, * from ./syncEngine |  |
| `localBookkeeping.ts` | 80 | 3 | SyncScope, stateHashKey, syncedIdsKey, tombstonesKey, sentHashesKey, +5 |  |
| `outbox/outbox.ts` | 58 | 1 | Outbox |  |
| `pairing.ts` | 170 | 2 | createPairingSession, claimPairingSession, approvePairingSession, approveAccountPairingSession, rejectPairingSession, +2 | Creates a new 5-minute pairing session with a 6-digit PIN on the relay server |
| `pushBundle.ts` | 292 | 1 | pushLocalChanges | Packing the local state into an outgoing bundle: what is dirty, what was alre… |
| `syncConfig.ts` | 140 | 2 | SyncConfigHost, computeSubscription, loadConfig, saveConfig, authHeaders, +3 | Where the sync config lives per vault, how requests are authorized, how a see… |
| `syncEngine.ts` | 865 | 17 | PendingPush, SyncEngine, syncEngine, storage, accountClient |  |
| `syncSocket.ts` | 41 | 1 | SyncSocketHost, connectSocket, handleIncoming, acknowledgeBundle | The live socket: open it for the current room, accept a frame, acknowledge a … |
| `transport.ts` | 208 | 2 | TransportCallbacks, TransportOptions, SendAckOptions, SyncTransport |  |
| `twoFactorAuth.ts` | 198 | 1 | TotpConfig, WebAuthnConfig, TwoFactorState, base32Encode, base32Decode, +6 | Two-Factor Authentication (2FA) for Zero-Knowledge Vaults |
| `types.ts` | 123 | 22 | DeviceSyncMode, DeviceProfile, SyncConnectionState, SubscriptionInfo, SyncStatus, +8 |  |
| `vaultSharing.ts` | 84 | 4 | getLocalVaultId, shareVaultWithDevice, acceptSharedVault, installSharedVault |  |

## src/lib/time — 4 файлов, 940 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendarLayout.ts` | 120 | 3 | LayoutPositionedTask, computeAntiOverlapLayout |  |
| `dateUtils.ts` | 126 | 15 | RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS, getISODateString, getTodayIso, getTomorrowIso, +11 | dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2. |
| `recurrenceHelper.ts` | 305 | 5 | RECURRENCE_PRESETS, parseISODateString, getIsoWeekday, formatRecurrenceLabel, computeNextStrictOccurrenceDate, +4 |  |
| `todoistTaskParser.ts` | 389 | 9 | ParsedTodoistTask, parseTodoistInput, TaskTimeSlot, getTaskTimeSlot, extractAndStripTags, +1 |  |

## src/lib/vault — 9 файлов, 807 строк

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

## src/mcp — 6 файлов, 1296 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 57 | 0 | startMcpServer |  |
| `prompts.ts` | 70 | 2 | registerMcpPrompts |  |
| `resources.ts` | 130 | 2 | registerMcpResources |  |
| `tools.ts` | 379 | 2 | registerMcpTools |  |
| `types.ts` | 82 | 2 | McpVaultConfig, VaultStateData, NoteMatch, SaveNoteSchema, GetNoteSchema, +6 |  |
| `vault.ts` | 578 | 5 | resolveVaultConfig, McpVault, getSafeNoteFilename |  |

## src/types — 2 файлов, 608 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 429 | 137 | SlagItemType, TaskStatus, SlagItemStatus, SlagItemPriority, SlagAttachment, +55 |  |
| `slashCommands.ts` | 179 | 3 | SlashCommand, SLASH_COMMANDS, CATEGORY_LABELS |  |
