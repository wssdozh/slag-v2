# CODE_MAP — карта модулей

Сгенерировано `npm run map:code`. Руками не править — перезапишется.
Читай эту карту до того, как грепать: колонка «импортят» показывает,
что модуль реально используется, «что это» — зачем он нужен.

Модулей: **347**, строк: **77113**, зон: **40**.

## Самые длинные файлы

| файл | строк | импортят |
|---|---:|---:|
| `src/lib/sync/bip39Words.ts` | 2052 | 1 |
| `e2e/slag/editor.spec.ts` | 1576 | 0 |
| `src/lib/sync/syncEngine.ts` | 1252 | 15 |
| `src/components/Feed/ItemCard.tsx` | 1151 | 1 |
| `src/components/Mobile/MobileCalendarView.tsx` | 1105 | 3 |
| `src/components/Feed/Composer.tsx` | 1094 | 4 |
| `e2e/slag/views.spec.ts` | 1061 | 0 |
| `src/lib/ai/localFallback.ts` | 1047 | 1 |
| `src/context/AppContext.tsx` | 996 | 52 |
| `src/components/Feed/AssistantChat.tsx` | 995 | 2 |
| `src/components/Editor/FullscreenEditor.tsx` | 990 | 1 |
| `src/lib/storage/index.ts` | 967 | 26 |
| `src/components/Modals/SettingsModal.tsx` | 874 | 2 |
| `e2e/slag/workspace.spec.ts` | 869 | 0 |
| `e2e/mobile.spec.ts` | 868 | 0 |

## e2e (playwright) — 91 файлов, 16908 строк

Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:

- `e2e/slag/editor.spec.ts` — 1576
- `e2e/slag/views.spec.ts` — 1061
- `e2e/slag/workspace.spec.ts` — 869
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
| `useAdminData.ts` | 248 | 6 | AdminStats, AdminDevice, AdminVault, AdminAccount, BillingStats, +7 |  |

## src/components/Audio — 4 файлов, 1555 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioCoverArt.tsx` | 157 | 1 | AudioCoverArt |  |
| `AudioPanel.tsx` | 715 | 2 | AudioPanel |  |
| `AudioPlaylistDrawer.tsx` | 265 | 1 | AudioPlaylistDrawer |  |
| `liquidOrb.ts` | 418 | 1 | OrbFrame, createOrbRenderer |  |

## src/components/Composer — 1 файлов, 102 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `QuickComposerWindow.tsx` | 102 | 1 | QuickComposerWindow |  |

## src/components/Editor — 5 файлов, 2420 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AttachmentStrip.tsx` | 219 | 1 | AttachmentStripProps, AttachmentStrip |  |
| `EditorToolbar.tsx` | 576 | 1 | EditorToolbarProps, EditorToolbar |  |
| `FullscreenEditor.tsx` | 990 | 1 | FullscreenEditor |  |
| `MobileEditorBar.tsx` | 325 | 1 | MobileEditorBarProps, MobileEditorBar |  |
| `useFullscreenDraft.ts` | 310 | 1 | UseFullscreenDraftOptions, UseFullscreenDraftReturn, useFullscreenDraft |  |

## src/components/Feed — 19 файлов, 6457 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ActiveFilterBadges.tsx` | 198 | 2 | ActiveFilterBadgesProps, ActiveFilterBadges |  |
| `AssistantChat.tsx` | 995 | 2 | AssistantChat |  |
| `BaseComposer.tsx` | 272 | 2 | BaseComposerProps, BaseComposer |  |
| `chat/ChatTaskBlock.tsx` | 52 | 1 | ChatTaskBlock |  |
| `Composer.tsx` | 1094 | 4 | ComposerProps, Composer |  |
| `composer/useComposerFiles.ts` | 155 | 1 | useComposerFiles |  |
| `ComposerTaskControls.tsx` | 257 | 1 | ComposerTaskControlsProps, ComposerTaskControls |  |
| `FeedColumnResizer.tsx` | 90 | 1 | FeedColumnResizer |  |
| `FeedHeader.tsx` | 166 | 1 | FeedHeaderProps, FeedHeader |  |
| `FeedList.tsx` | 633 | 2 | FeedList |  |
| `FolderSuggestionMenu.tsx` | 101 | 1 | FolderSuggestionMenu |  |
| `ItemCard.tsx` | 1151 | 1 | ItemCardProps, ItemCard |  |
| `PinnedBanner.tsx` | 217 | 1 | PinnedBanner |  |
| `SlashCommandMenu.tsx` | 101 | 1 | SlashCommandMenu |  |
| `SuggestionMenuHeader.tsx` | 28 | 4 | SuggestionMenuHeader |  |
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
| `AttachSheet.tsx` | 203 | 1 | AttachSheet |  |
| `DesktopSources.tsx` | 83 | 1 | DesktopSourcesProps, DesktopSources |  |
| `FolderBrowser.tsx` | 143 | 1 | FolderBrowserProps, FolderBrowser |  |
| `MediaGrid.tsx` | 327 | 1 | MediaGridProps, MediaGrid |  |
| `MediaPreview.tsx` | 234 | 1 | MediaPreviewProps, MediaPreview |  |
| `MobilePicker.tsx` | 114 | 1 | MobilePickerProps, MobilePicker |  |
| `useDeviceGallery.ts` | 80 | 1 | useDeviceGallery |  |
| `useFolderBrowser.ts` | 90 | 1 | useFolderBrowser |  |
| `ViewerVideo.tsx` | 127 | 2 | ViewerVideoProps, ViewerVideo |  |

## src/components/Mobile — 10 файлов, 2467 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `MobileAssistantView.tsx` | 71 | 1 | MobileAssistantView |  |
| `MobileAudioView.tsx` | 12 | 1 | MobileAudioView |  |
| `MobileCalendarView.tsx` | 1105 | 3 | MobileCalendarView |  |
| `MobileFloatingDock.tsx` | 159 | 1 | MobileFloatingDockProps, MobileFloatingDock |  |
| `MobileFolderInfoView.tsx` | 70 | 1 | MobileFolderInfoView |  |
| `MobileFoldersView.tsx` | 394 | 1 | MobileFoldersView |  |
| `MobileScreenHeader.tsx` | 86 | 5 | MobileScreenHeaderProps, MobileScreenHeader |  |
| `MobileSettingsView.tsx` | 133 | 1 | MobileSettingsView |  |
| `MobileShell.tsx` | 112 | 1 | MobileShell |  |
| `MobileTasksView.tsx` | 325 | 1 | MobileTasksView |  |

## src/components/Modals — 10 файлов, 3021 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `BaseModal.tsx` | 156 | 10 | BaseModalProps, BaseModal |  |
| `ComposerModal.tsx` | 59 | 2 | ComposerModal |  |
| `ConfirmDialog.tsx` | 55 | 1 | ConfirmDialog |  |
| `DiffModal.tsx` | 532 | 1 | DiffModalItemEntry, DiffModalProps, DiffModal |  |
| `FolderInfoModal.tsx` | 94 | 2 | FolderInfoModal |  |
| `FolderModal.tsx` | 166 | 2 | FolderModal |  |
| `FolderViewModal.tsx` | 318 | 2 | FolderViewModal |  |
| `SettingsModal.tsx` | 874 | 2 | SettingsModal |  |
| `TriageModal.tsx` | 484 | 1 | TriageModal |  |
| `VaultModal.tsx` | 283 | 2 | VaultModal |  |

## src/components/RightPanel — 3 файлов, 448 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `FolderInfoPanel.tsx` | 18 | 1 | FolderInfoPanel |  |
| `FolderMediaTabs.tsx` | 313 | 1 | FolderMediaTabId, FolderMediaTabsProps, FolderMediaTabs |  |
| `useFolderMedia.ts` | 117 | 4 | FolderMediaData, useFolderMedia |  |

## src/components/Search — 1 файлов, 444 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `SearchModal.tsx` | 444 | 3 | SearchModal |  |

## src/components/Settings — 6 файлов, 1260 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AccountSettingsTab.tsx` | 66 | 1 | AccountSettingsTab |  |
| `DevicesSettingsTab.tsx` | 536 | 1 | DevicesSettingsTab |  |
| `MobileDockSettings.tsx` | 230 | 1 | MobileDockSettings |  |
| `SecretKeyField.tsx` | 49 | 1 | SecretKeyField |  |
| `SettingsUI.tsx` | 296 | 7 | SettingsGroup, SettingsDivider, SettingsRow, SettingsSwitch, SettingsSelect, +2 |  |
| `SyncSettingsTab.tsx` | 83 | 1 | SyncSettingsTab |  |

## src/components/Sidebar — 3 файлов, 498 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `folderIcons.ts` | 37 | 7 | FOLDER_ICONS |  |
| `FolderTree.tsx` | 257 | 1 | FolderTree |  |
| `Sidebar.tsx` | 204 | 1 | Sidebar |  |

## src/components/UI — 26 файлов, 4677 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AudioPlayer.tsx` | 388 | 4 | AudioPlayer |  |
| `AudioRecorder.tsx` | 192 | 2 | AudioRecorder |  |
| `Button.tsx` | 56 | 6 | ButtonProps, Button |  |
| `Checkbox.tsx` | 75 | 2 | CheckboxProps, Checkbox |  |
| `ContextMenu.tsx` | 712 | 1 | ContextMenu |  |
| `DatePickerPopover.tsx` | 233 | 2 | DatePickerPopoverProps, DatePickerPopover |  |
| `EmptyState.tsx` | 31 | 2 | EmptyStateProps, EmptyState |  |
| `IconButton.tsx` | 50 | 6 | IconButtonProps, IconButton |  |
| `ImageLightbox.tsx` | 352 | 3 | ImageLightboxProps, ImageLightbox, LightboxImage |  |
| `LightboxTextPanel.tsx` | 150 | 1 | LightboxTextPanelProps, LightboxTextPanel |  |
| `MarkdownRenderer.tsx` | 185 | 3 | MarkdownRenderer |  |
| `MenuDropdown.tsx` | 188 | 4 | MenuDropdownProps, MenuDropdown |  |
| `MobileActionSheet.tsx` | 186 | 1 | MobileActionSheet |  |
| `NumberInput.tsx` | 98 | 1 | NumberInputProps, NumberInput |  |
| `PriorityBadge.tsx` | 75 | 5 | TaskPriority, LinearSignalBarsProps, LinearSignalBars |  |
| `ResponsiveSegmented.tsx` | 186 | 4 | SegmentedOption, ResponsiveSegmentedProps, ResponsiveSegmented |  |
| `Select.tsx` | 352 | 10 | SelectOption, SelectProps, Select |  |
| `SendButton.tsx` | 48 | 4 | SendButtonProps, SendButton |  |
| `SheetPanel.tsx` | 353 | 2 | SheetPanelApi, SheetPanelProps, SheetPanel |  |
| `TagChip.tsx` | 81 | 4 | TagChipProps, TagChip |  |
| `TaskStatusMark.tsx` | 49 | 3 | TaskStatusMarkProps, TaskStatusMark |  |
| `Toast.tsx` | 172 | 2 | ToastContainer |  |
| `ToolbarButton.tsx` | 58 | 2 | ToolbarButtonProps, ToolbarButton |  |
| `VideoCirclePlayer.tsx` | 145 | 3 | VideoCirclePlayer |  |
| `VideoRecorder.tsx` | 212 | 1 | VideoRecorder |  |
| `WindowControls.tsx` | 50 | 1 | WindowControls |  |

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

## src/config — 8 файлов, 456 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `ai.ts` | 86 | 1 | AI_ENDPOINTS, DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT, AI_LIMITS, AI_STOP_TAGS, +1 |  |
| `index.ts` | 7 | 76 | * from ./storage, * from ./sync, * from ./ai, * from ./search, * from ./ui, +1 |  |
| `search.ts` | 9 | 1 | SEARCH_LIMITS |  |
| `settingsTabs.ts` | 33 | 4 | SettingsTabId, SettingsTabDefinition, SETTINGS_TABS, settingsTabLabel |  |
| `storage.ts` | 102 | 2 | DEFAULT_INBOX_FOLDER, SPECIAL_DIRS, STORAGE_KEYS, DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, +2 |  |
| `sync.ts` | 44 | 1 | DEFAULT_SYNC_SERVER_URL, OFFICIAL_SYNC_DOMAINS, SYNC_STORAGE_KEYS, SYNC_INTERVALS, SYNC_ATTACHMENT_MAX_BYTES, +1 |  |
| `typography.ts` | 111 | 3 | FontFamilyOption, FONT_FAMILY_OPTIONS, FontScaleOption, FONT_SCALE_OPTIONS, VISUAL_PRIORITIES, +2 |  |
| `ui.ts` | 64 | 2 | ACCENT_COLORS, UI_BREAKPOINTS, UI_LAYOUT, UI_DELAYS, UI_GESTURES |  |

## src/context — 2 файлов, 1228 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `AppContext.tsx` | 996 | 52 | AppContext, AppProvider, useApp, ToastMessage, AttachSheetRequest, +1 | oxlint-disable react/only-export-components |
| `appContext.types.ts` | 232 | 3 | ToastMessage, AttachSheetRequest, ContextMenuTarget, AppContextType | The contract AppContext exposes to every consumer, plus the shapes the UI |

## src/context/feed — 1 файлов, 89 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `feedView.ts` | 89 | 1 | FeedViewQuery, selectVisibleItems |  |

## src/context/hooks — 7 файлов, 1046 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAppearance.ts` | 119 | 1 | useAppearance |  |
| `useAssistant.ts` | 139 | 1 | useAssistant |  |
| `useBackup.ts` | 145 | 1 | useBackup |  |
| `useFeedView.ts` | 215 | 1 | useFeedView |  |
| `useMobileNav.ts` | 130 | 1 | DEFAULT_MOBILE_DOCK_TABS, useMobileNav |  |
| `useOverlays.ts` | 235 | 1 | useOverlays |  |
| `useRecurringRollover.ts` | 63 | 1 | useRecurringRollover |  |

## src/hooks — 9 файлов, 1292 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useAttachmentSrc.ts` | 50 | 6 | AttachmentSrcs, useAttachmentSrcs, useAttachmentSrc |  |
| `useAudioAnalyser.ts` | 88 | 1 | useAudioAnalyser |  |
| `useCalendarSchedule.ts` | 127 | 2 | CalendarTask, UseCalendarScheduleParams, CalendarScheduleResult, useCalendarSchedule |  |
| `useComposerMedia.ts` | 203 | 1 | UseComposerMediaOptions, useComposerMedia |  |
| `useGlobalHotkeys.ts` | 54 | 1 | useGlobalHotkeys |  |
| `useItemActions.ts` | 280 | 3 | PRIORITY_LABELS, TYPE_LABELS, useItemActions |  |
| `useLayerStack.ts` | 122 | 1 | AppLayer, useLayerStack |  |
| `usePresence.ts` | 92 | 28 | usePresence |  |
| `useSuggestedActions.ts` | 276 | 1 | ActionHistoryEntry, useSuggestedActions |  |

## src/hooks/gestures — 6 файлов, 1091 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useDragToScroll.ts` | 232 | 2 | DragToScrollOptions, useDragToScroll |  |
| `usePhotoPager.ts` | 320 | 2 | PhotoPagerOptions, usePhotoPager |  |
| `usePointerDnd.ts` | 244 | 2 | DragItemPayload, UsePointerDndOptions, PointerDndState, usePointerDnd |  |
| `usePullToSearch.ts` | 88 | 1 | usePullToSearch |  |
| `useSheetDrag.ts` | 157 | 1 | useSheetDrag |  |
| `useSwipeGesture.ts` | 50 | 2 | SwipeGestureOptions, useSwipeGesture |  |

## src/hooks/layout — 5 файлов, 282 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `useComposerInset.ts` | 38 | 2 | useComposerInset |  |
| `useEditorPaneRect.ts` | 58 | 1 | EditorPaneRect, useEditorPaneRect |  |
| `useFlipLayout.ts` | 96 | 2 | useFlipLayout |  |
| `useIsMobile.ts` | 35 | 2 | useIsMobile |  |
| `useVisualViewportHeight.ts` | 55 | 1 | useVisualViewportHeight |  |

## src/lib — 16 файлов, 3447 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `aiService.ts` | 428 | 6 | CategorizeResult, TriageSuggestion, TriageProgress, TriageProgressCallback, categorizeDraft, +4 |  |
| `backupService.ts` | 605 | 1 | SlagManifest, BackupService, backupService, DEFAULT_BACKUP_SETTINGS |  |
| `chatMarkdown.ts` | 71 | 1 | ChatSegment, splitTaskBlocks |  |
| `commands.ts` | 279 | 3 | CommandCategory, AppCommandContext, AppCommand, isMac, formatShortcut, +3 | ponytail: central command & hotkey engine for SLAG v2 without external depend… |
| `diffUtils.ts` | 265 | 1 | WordChunk, SideBySideDiffRow, DiffResult, MetadataDiffItem, computeLineWordDiff, +2 |  |
| `folderOpener.ts` | 72 | 4 | OpenFolderResult, openAppFolder |  |
| `formatBytes.ts` | 7 | 5 | formatBytes |  |
| `logger.ts` | 648 | 37 | LogListener, logger |  |
| `motion.ts` | 195 | 9 | MotionToken, MotionEase, prefersReducedMotion, motionMs, motionEase, +7 |  |
| `navigation.ts` | 13 | 6 | navigatePage | Единственная точка перехода между страницами приложения (?page=…). |
| `platform.ts` | 86 | 2 | isTauriEnvironment, PlatformInfo, getPlatformInfo, setupSystemHotkey, removeSystemHotkey |  |
| `searchService.ts` | 175 | 3 | getSearchableAttachmentText, initSearchIndex, querySearch |  |
| `taskCompletion.ts` | 35 | 1 | applyTaskCompletion |  |
| `taskUtils.ts` | 101 | 10 | parseSubtasksFromContent, toggleCheckboxInContent, setAllCheckboxesInContent, migrateLegacySubtasksToContent, PRIORITY_LABELS |  |
| `vaultDisplay.ts` | 23 | 5 | getVaultDisplayName |  |
| `windowControls.ts` | 444 | 14 | isMobilePlatform, isDesktopApp, isPrimaryWindow, minimizeWindow, toggleMaximizeWindow, +17 |  |

## src/lib/ai — 12 файлов, 3777 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `actionParser.ts` | 375 | 3 | cleanSnippetText, extractActionBlock |  |
| `adapters/anthropicAdapter.ts` | 187 | 1 | AnthropicMessagesAdapter |  |
| `adapters/openAiAdapter.ts` | 221 | 1 | extractErrorMessage, OpenAiChatAdapter |  |
| `adapters/openAiResponsesAdapter.ts` | 219 | 1 | OpenAiResponsesAdapter |  |
| `aiClient.ts` | 231 | 2 | AiResolvedTarget, PromptRequest, PromptResult, resolveKieEndpoint, resolveAiTarget, +4 |  |
| `appGuide.ts` | 243 | 2 | APP_GUIDE_TOPICS, AppGuideTopic, getAppGuideContent | ponytail: curated topic catalog for in-app assistant UI navigation & feature … |
| `localFallback.ts` | 1047 | 1 | LocalFallbackParams, runLocalFallbackAgent | Offline intent chain: what the assistant does without an API key. |
| `orchestrator.ts` | 405 | 1 | AssistantOrchestrator, assistantOrchestrator, resolveKieEndpoint, resolveAiTarget, extractActionBlock, +3 |  |
| `prompt.ts` | 156 | 1 | buildSystemPrompt |  |
| `toolDefinitions.ts` | 171 | 1 | getCanonicalTools |  |
| `tools.ts` | 441 | 1 | createLocalToolExecutor |  |
| `types.ts` | 81 | 8 | AssistantToolDefinition, ExecutedToolCall, AdapterTurnHistoryItem, LlmAdapterTurnRequest, LlmAdapterTurnResponse, +3 |  |

## src/lib/media — 8 файлов, 1621 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentEnrichment.ts` | 603 | 4 | resolveRelayMedia, canEnrichAttachments, buildImageInstruction, extractFocalContext, dataUrlToBlob, +3 |  |
| `audioHelper.ts` | 186 | 6 | AudioTrack, AudioScopeMode, AudioTypeFilter, detectAudioFormat, splitAudioName, +6 |  |
| `audioSpectrum.ts` | 439 | 3 | OrbFeatures, ORB_SILENCE, ORB_FFT_SIZE, createSpectrumReader | Features for the liquid orb. |
| `byteCodec.ts` | 16 | 3 | bytesToBase64, base64ToBytes, toArrayBuffer |  |
| `deviceGallery.ts` | 40 | 1 | isDeviceGalleryAvailable, getGalleryAccess, requestGalleryAccess, listDeviceMedia, DeviceMediaItem, +1 |  |
| `fileDropHelper.ts` | 119 | 4 | MAX_ATTACHMENT_BYTES, attachmentType, attachmentFromDataUrl, processFileListToAttachments |  |
| `folderBrowser.ts` | 128 | 4 | listFolders, pickFolder, listFolderEntries, pickFilesFromSystem, readEntryBytes, +3 |  |
| `imageCodec.ts` | 90 | 2 | EncodedImage, ImageEncodeOptions, STORED_IMAGE_MAX_DIM, STORED_IMAGE_QUALITY, UNCOMPRESSIBLE_IMAGE_TYPES, +3 |  |

## src/lib/storage — 7 файлов, 2199 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `attachmentData.ts` | 21 | 3 | stripAttachmentList, stripAttachmentData |  |
| `attachments.ts` | 209 | 2 | AttachmentStore |  |
| `draftStore.ts` | 248 | 1 | DraftStore |  |
| `index.ts` | 967 | 26 | StorageChangeEvent, StorageChangeListener, DEFAULT_ITEMS, StorageService, storage, +5 |  |
| `indexedDb.ts` | 143 | 3 | idbSaveAttachment, idbGetAttachment, idbGetAllAttachments, StoredSnapshotRecord, idbSaveSnapshot, +3 |  |
| `vaultFiles.ts` | 498 | 1 | VaultFilesDeps, VaultFiles |  |
| `vaultTransfer.ts` | 113 | 1 | VaultSnapshot, exportObsidianBundle, buildVaultExportJson, VaultImportIo, VaultImportPayload, +2 |  |

## src/lib/sync — 19 файлов, 6056 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `account.ts` | 569 | 14 | accountClient, generateMnemonic, AccountDevice, AccountDeviceInput, AccountInfo, +6 |  |
| `accountCrypto.ts` | 262 | 5 | AccountIdentity, generateAccountIdentity, signDeviceChallenge, getOrCreateDeviceIdentity, renameStoredDevice, +4 |  |
| `accountTypes.ts` | 90 | 6 | AccountInfo, AccountDevice, VaultGrant, AccountVault, VaultInvitation, +5 |  |
| `applyBundle.ts` | 318 | 1 | persistIncomingBundle |  |
| `attachmentSignature.ts` | 6 | 2 | attachmentSignature |  |
| `bip39Words.ts` | 2052 | 1 | BIP39_WORDS | Standard BIP-39 English wordlist (2048 words) |
| `crypto.ts` | 181 | 9 | generateMnemonic, validateMnemonic, deriveVaultKey, deriveRoomId, encryptBundle, +5 |  |
| `devices.ts` | 238 | 2 | normalizeTrustedDevice, touchDeviceLastSeen, normalizeTrustedDevicesFromAccount, computeSubscription, createDefaultDeviceName, +8 |  |
| `entities/registry.ts` | 35 | 1 | createSyncOpFromStorageEvent |  |
| `entities/types.ts` | 16 | 2 | SyncEntityKind, SyncAction, SyncOperation |  |
| `index.ts` | 5 | 1 | * from ./types, * from ./crypto, * from ./pairing, * from ./syncEngine |  |
| `localBookkeeping.ts` | 80 | 2 | SyncScope, stateHashKey, syncedIdsKey, tombstonesKey, sentHashesKey, +5 |  |
| `outbox/outbox.ts` | 58 | 1 | Outbox |  |
| `pairing.ts` | 180 | 2 | createPairingSession, claimPairingSession, approvePairingSession, approveAccountPairingSession, rejectPairingSession, +3 |  |
| `syncEngine.ts` | 1252 | 15 | SyncEngine, syncEngine, storage, accountClient |  |
| `transport.ts` | 212 | 1 | TransportCallbacks, TransportOptions, SendAckOptions, SyncTransport |  |
| `twoFactorAuth.ts` | 295 | 1 | TotpConfig, WebAuthnConfig, TwoFactorState, base32Encode, base32Decode, +8 | Two-Factor Authentication (2FA) for Zero-Knowledge Vaults |
| `types.ts` | 123 | 14 | DeviceSyncMode, DeviceProfile, SyncConnectionState, SubscriptionInfo, SyncStatus, +8 |  |
| `vaultSharing.ts` | 84 | 3 | getLocalVaultId, shareVaultWithDevice, acceptSharedVault, installSharedVault |  |

## src/lib/time — 4 файлов, 940 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `calendarLayout.ts` | 120 | 3 | LayoutPositionedTask, computeAntiOverlapLayout |  |
| `dateUtils.ts` | 126 | 15 | RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS, getISODateString, getTodayIso, getTomorrowIso, +11 | dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2. |
| `recurrenceHelper.ts` | 305 | 5 | RECURRENCE_PRESETS, parseISODateString, getIsoWeekday, formatRecurrenceLabel, computeNextStrictOccurrenceDate, +4 |  |
| `todoistTaskParser.ts` | 389 | 9 | ParsedTodoistTask, parseTodoistInput, TaskTimeSlot, getTaskTimeSlot, extractAndStripTags, +1 |  |

## src/lib/vault — 9 файлов, 789 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `demoVault.ts` | 238 | 1 | generateDemoItems |  |
| `folderItems.ts` | 19 | 1 | itemsInFolder |  |
| `folderOptions.ts` | 94 | 6 | FolderSelectOption, buildFolderOptions |  |
| `folderPaths.ts` | 38 | 3 | sanitizeFolderName, parentPathOf, folderPathForName, folderPathUnder, isFolderPathFree, +2 |  |
| `itemSchema.ts` | 46 | 1 | PropertySchemaItem, ITEM_MUTABLE_PROPERTIES, ITEM_UPDATES_SCHEMA | Single Source of Truth (SSOT) metadata registry for SlagItem mutable fields. |
| `itemUpdates.ts` | 70 | 2 | applyItemUpdates |  |
| `markdownSerializer.ts` | 198 | 5 | serializeItemToMarkdown, parseMarkdownToItem |  |
| `noteFilename.ts` | 20 | 6 | getSafeNoteFilename, withIdSuffix | ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; … |
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

## src/styles — 1 файлов, 44 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `theme.ts` | 44 | 0 | THEME_COLORS, ThemeColorKey | SLAG v2 - Master Theme Colors (TypeScript Constants) |

## src/types — 2 файлов, 608 строк

| файл | строк | импортят | экспортирует | что это |
|---|---:|---:|---|---|
| `index.ts` | 429 | 111 | SlagItemType, TaskStatus, SlagItemStatus, SlagItemPriority, SlagAttachment, +55 |  |
| `slashCommands.ts` | 179 | 3 | SlashCommand, SLASH_COMMANDS, CATEGORY_LABELS |  |
