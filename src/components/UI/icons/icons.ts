// The one icon config: a semantic name per glyph, grouped by meaning.
// Change a glyph here and every call site follows вЂ” nothing else imports an icon set.
//
// Tabler carries the set: outline is the glyph (what a thing is), filled is a state
// (this one is on right now). A filled twin is declared only for the keys the interface
// actually toggles вЂ” `pair()` below. The catalogue has many more `-filled` glyphs than
// that; adding one without a toggling call site is a second way to draw the same thing.
import type { ComponentType, SVGProps } from 'react';
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconAntenna,
  IconArchive,
  IconArchiveFilled,
  IconArrowBackUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconArrowsShuffle,
  IconArrowsSort,
  IconArrowUpRight,
  IconArticle,
  IconBell,
  IconBellFilled,
  IconBold,
  IconBolt,
  IconBook,
  IconBook2,
  IconBookFilled,
  IconBookmark,
  IconBookmarkFilled,
  IconBraces,
  IconBrandTelegram,
  IconBriefcase,
  IconBulb,
  IconCalendar,
  IconCamera,
  IconCarouselHorizontal,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircle,
  IconCircleArrowDown,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCirclePlus,
  IconClock,
  IconCloudCheck,
  IconCloudUpload,
  IconCode,
  IconCoffee,
  IconColumns3,
  IconCommand,
  IconCompass,
  IconCopy,
  IconCornerDownLeft,
  IconCornerUpLeft,
  IconCpu,
  IconCreditCard,
  IconDatabase,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDots,
  IconDotsVertical,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconEyeFilled,
  IconEyeOff,
  IconFile,
  IconFileCode,
  IconFileMinus,
  IconFilter,
  IconFlame,
  IconFolder,
  IconFolderFilled,
  IconFolderMinus,
  IconFolderOpen,
  IconFolderPlus,
  IconGitCompare,
  IconGripVertical,
  IconH1,
  IconH2,
  IconHash,
  IconHeart,
  IconHeartFilled,
  IconHistory,
  IconInbox,
  IconInfoCircle,
  IconItalic,
  IconKey,
  IconKeyboard,
  IconLayoutKanban,
  IconLink,
  IconList,
  IconListCheck,
  IconLoader2,
  IconLock,
  IconLockFilled,
  IconLockOpen,
  IconLogout,
  IconMaximize,
  IconMicrophone,
  IconMinimize,
  IconMinus,
  IconMusic,
  IconNote,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPhotoOff,
  IconPin,
  IconPinFilled,
  IconPlayerPause,
  IconPlayerPauseFilled,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlaylist,
  IconPlug,
  IconPlus,
  IconQuote,
  IconRefresh,
  IconReload,
  IconRepeat,
  IconRepeatOnce,
  IconRestore,
  IconSearch,
  IconSend,
  IconServer,
  IconServer2,
  IconSettings,
  IconSettings2,
  IconSettingsFilled,
  IconShield,
  IconSitemap,
  IconSortAscending,
  IconSortDescending,
  IconSparkles,
  IconSparklesFilled,
  IconSquare,
  IconSquareCheck,
  IconSquareCheckFilled,
  IconStrikethrough,
  IconTable,
  IconTag,
  IconTerminal,
  IconTool,
  IconTrash,
  IconTrendingUp,
  IconUpload,
  IconUser,
  IconUsers,
  IconVideo,
  IconVolume,
  IconVolumeOff,
  IconWaveform,
  IconWifi,
  IconWorld,
  IconX,
  IconZoomIn,
} from '@tabler/icons-react';

/**
 * A glyph component. Deliberately structural, not tied to one package: any icon set whose
 * component is an SVG element taking standard props can hold a registry slot.
 */
export type GlyphComponent = ComponentType<SVGProps<SVGSVGElement>>;
export type Glyph = GlyphComponent;

/**
 * A glyph plus its on-state twin. `className` rides along because one entry (the spinner)
 * always wears extra classes, so fifteen call sites stop repeating `animate-spin`.
 */
interface PairedGlyph {
  icon: Glyph;
  filled?: Glyph;
  className?: string;
}

/** A bare glyph, or a glyph that carries a filled twin and/or its own classes. */
export type IconEntry = Glyph | PairedGlyph;

/** Declares a filled twin. Used exactly where the interface toggles a glyph on. */
function pair(icon: Glyph, filled?: Glyph): PairedGlyph {
  return { icon, filled };
}

/**
 * The whole set. Keys are `group.name`, derived from meaning, never from the glyph:
 * swapping a glyph is one line and every call site follows.
 */
export const ICONS = {
  // в”Ђв”Ђв”Ђ nav: where it leads в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'nav.back': IconArrowLeft,
  'nav.forward': IconArrowRight,
  'nav.prev': IconChevronLeft,
  'nav.next': IconChevronRight,
  'nav.up': IconChevronUp,
  'nav.down': IconChevronDown,
  'nav.open': IconArrowUpRight,
  'nav.externalLink': IconExternalLink,

  // в”Ђв”Ђв”Ђ action: what it does to something в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'action.close': IconX,
  'action.add': IconPlus,
  'action.addCircle': IconCirclePlus,
  'action.decrement': IconMinus,
  'action.moveDown': IconArrowDown,
  'action.send': IconSend,
  'action.check': IconCheck,
  'action.delete': IconTrash,
  'action.edit': IconPencil,
  'action.rename': IconPencil,
  'action.copy': IconCopy,
  'action.search': IconSearch,
  'action.filter': IconFilter,
  'action.refresh': IconRefresh,
  'action.retry': IconReload,
  'action.undo': IconArrowBackUp,
  'action.redo': IconArrowForwardUp,
  'action.more': IconDotsVertical,
  'action.moreHorizontal': IconDots,
  'action.download': IconDownload,
  'action.upload': IconCloudUpload,
  'action.uploadFile': IconUpload,
  'action.link': IconLink,
  'action.pin': pair(IconPin, IconPinFilled),
  'action.reply': IconCornerUpLeft,
  'action.attach': IconPaperclip,
  'action.expand': IconMaximize,
  'action.collapse': IconMinimize,
  'action.expandPane': IconArrowsMaximize,
  'action.collapsePane': IconArrowsMinimize,
  'action.preview': pair(IconEye, IconEyeFilled),
  'action.hide': IconEyeOff,
  'action.lock': pair(IconLock, IconLockFilled),
  'action.sort': IconArrowsSort,
  'action.sortAsc': IconSortAscending,
  'action.sortDesc': IconSortDescending,
  'action.archive': IconArchive,
  'action.restore': IconRestore,
  'action.logout': IconLogout,
  'action.diff': IconGitCompare,
  'action.dragHandle': IconGripVertical,
  'action.folderAdd': IconFolderPlus,
  'action.folderMove': IconFolderMinus,
  'action.transcribe': IconWaveform,

  // в”Ђв”Ђв”Ђ format: markdown and text marks в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'format.bold': IconBold,
  'format.italic': IconItalic,
  'format.strike': IconStrikethrough,
  'format.h1': IconH1,
  'format.h2': IconH2,
  'format.list': IconList,
  'format.quote': IconQuote,
  'format.code': IconCode,
  'format.table': IconTable,

  // в”Ђв”Ђв”Ђ entity: what kind of thing it is в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'entity.note': IconNote,
  'entity.task': pair(IconSquareCheck, IconSquareCheckFilled),
  'entity.article': IconArticle,
  'entity.folder': pair(IconFolder, IconFolderFilled),
  'entity.folderOpen': IconFolderOpen,
  'entity.folderSynced': IconCloudCheck,
  'entity.folderFilter': IconFilter,
  'entity.folderInfo': IconInfoCircle,
  'entity.inbox': IconInbox,
  'entity.vault': IconDatabase,
  'entity.tag': IconHash,
  'entity.tagHash': IconHash,
  'entity.kanban': IconLayoutKanban,
  'entity.layers': IconSitemap,
  'entity.materials': IconBook2,
  'entity.link': IconLink,
  'entity.taskList': IconListCheck,
  'entity.versions': IconHistory,
  'entity.disk': IconServer2,
  'entity.file': IconFile,
  'entity.fileCode': IconFileCode,
  'entity.fileMissing': IconFileMinus,
  'entity.image': IconPhoto,
  'entity.images': IconCarouselHorizontal,
  'entity.imageMissing': IconPhotoOff,
  'entity.user': IconUser,
  'entity.desktop': IconDeviceLaptop,
  'entity.phone': IconDeviceMobile,
  'entity.telegram': IconBrandTelegram,

  // в”Ђв”Ђв”Ђ time: dates, clocks, recurrence в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'time.date': IconCalendar,
  'time.calendar': IconCalendar,
  'time.time': IconClock,
  'time.repeat': IconRepeat,
  'time.repeatOne': IconRepeatOnce,
  'time.threeDay': IconColumns3,

  // в”Ђв”Ђв”Ђ status: the state of a thing в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'status.loading': { icon: IconLoader2, className: 'animate-spin' },
  'status.backlog': IconCircleDashed,
  'status.todo': IconCircle,
  'status.done': pair(IconCircleCheck, IconCircleCheckFilled),
  'status.alert': IconAlertCircle,
  'status.warning': IconAlertTriangle,
  'status.info': IconInfoCircle,
  'status.urgent': IconFlame,
  'status.priority': IconBolt,
  'status.unlocked': IconLockOpen,
  'status.live': IconAntenna,

  // в”Ђв”Ђв”Ђ media: transport, capture, sound в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'media.play': pair(IconPlayerPlay, IconPlayerPlayFilled),
  'media.pause': pair(IconPlayerPause, IconPlayerPauseFilled),
  'media.skipBack': IconPlayerSkipBack,
  'media.skipForward': IconPlayerSkipForward,
  'media.seekForward': IconPlayerTrackNext,
  'media.shuffle': IconArrowsShuffle,
  'media.volumeOn': IconVolume,
  'media.volumeOff': IconVolumeOff,
  'media.microphone': IconMicrophone,
  'media.camera': IconCamera,
  'media.video': IconVideo,
  'media.music': IconMusic,
  'media.queue': IconPlaylist,
  'media.zoomIn': IconZoomIn,

  // в”Ђв”Ђв”Ђ system: the app itself в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'system.ai': pair(IconSparkles, IconSparklesFilled),
  'system.logs': IconTerminal,
  'system.sync': IconRefresh,
  'system.update': IconCircleArrowDown,
  'system.web': IconWorld,
  'system.settings': pair(IconSettings, IconSettingsFilled),
  'system.command': IconCommand,
  'system.keyEnter': IconCornerDownLeft,
  'system.shortcuts': IconKeyboard,
  'system.security': IconShield,
  'system.secretKey': IconKey,
  'system.desktopMode': IconDeviceDesktop,
  'system.integrations': IconPlug,
  'system.integrationConfig': IconSettings2,
  'system.connectionTest': IconWifi,
  'system.notifications': pair(IconBell, IconBellFilled),
  'system.appearance': IconAdjustmentsHorizontal,
  'system.windowMaximize': IconSquare,

  // в”Ђв”Ђв”Ђ admin: the relay console в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'admin.activity': IconActivity,
  'admin.chart': IconChartBar,
  'admin.billing': IconCreditCard,
  'admin.server': IconServer,
  'admin.trend': IconTrendingUp,
  'admin.users': IconUsers,
  'admin.maintenance': IconTool,

  // в”Ђв”Ђв”Ђ folder: the picker a folder chooses its own glyph from в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'folder.generic': pair(IconFolder, IconFolderFilled),
  'folder.code': IconBraces,
  'folder.briefcase': IconBriefcase,
  'folder.book': pair(IconBook, IconBookFilled),
  'folder.flame': IconFlame,
  'folder.sparkles': pair(IconSparkles, IconSparklesFilled),
  'folder.coffee': IconCoffee,
  'folder.heart': pair(IconHeart, IconHeartFilled),
  'folder.compass': IconCompass,
  'folder.tag': IconTag,
  'folder.archive': pair(IconArchive, IconArchiveFilled),
  'folder.cpu': IconCpu,
  'folder.layers': IconSitemap,
  'folder.bookmark': pair(IconBookmark, IconBookmarkFilled),
  'folder.lightbulb': IconBulb,
} satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICONS;

/**
 * One class per tone, so a dynamic glyph (kanban status, dock tab) can pick a colour
 * without inventing a hex. Kept here, next to the registry, because a component file
 * may only export components.
 */
export const ICON_TONE_CLASS: Record<
  | 'inherit'
  | 'primary'
  | 'soft'
  | 'tertiary'
  | 'secondary'
  | 'muted'
  | 'dim'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info',
  string
> = {
  inherit: '',
  primary: 'text-fg-primary',
  soft: 'text-fg-soft',
  tertiary: 'text-fg-tertiary',
  secondary: 'text-fg-secondary',
  muted: 'text-fg-muted',
  dim: 'text-fg-dim',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-mention',
};

/**
 * Folder glyphs are stored as strings. They used to be Lucide names, then registry keys;
 * both resolve here, so a vault written by either build opens with the right glyph.
 * `Inbox` and `Code` are written by the storage defaults and the MCP server, so they are
 * read from old vaults even though the picker never offered them.
 */
export const LEGACY_FOLDER_ICONS: Record<string, IconName> = {
  Folder: 'folder.generic',
  Code2: 'folder.code',
  Code: 'folder.code',
  Briefcase: 'folder.briefcase',
  Book: 'folder.book',
  Flame: 'folder.flame',
  Sparkles: 'folder.sparkles',
  Coffee: 'folder.coffee',
  Heart: 'folder.heart',
  Compass: 'folder.compass',
  Tag: 'folder.tag',
  Archive: 'folder.archive',
  Cpu: 'folder.cpu',
  Layers: 'folder.layers',
  Bookmark: 'folder.bookmark',
  Lightbulb: 'folder.lightbulb',
  Inbox: 'entity.inbox',
};

/** Resolves whatever a folder's meta carries вЂ” a registry key or a legacy lucide name. */
export function folderIconName(stored: string | undefined | null): IconName {
  if (!stored) return 'folder.generic';
  if (stored in ICONS) return stored as IconName;
  return LEGACY_FOLDER_ICONS[stored] ?? 'folder.generic';
}

/** The picker grid: one entry per selectable folder glyph, in display order. */
export const FOLDER_ICON_CHOICES: ReadonlyArray<{ key: IconName; label: string }> = [
  { key: 'folder.generic', label: 'РџР°РїРєР°' },
  { key: 'folder.code', label: 'РљРѕРґ' },
  { key: 'folder.briefcase', label: 'Р Р°Р±РѕС‚Р°' },
  { key: 'folder.book', label: 'РљРЅРёРіР°' },
  { key: 'folder.flame', label: 'РЎСЂРѕС‡РЅРѕРµ' },
  { key: 'folder.sparkles', label: 'РР' },
  { key: 'folder.coffee', label: 'Р›РёС‡РЅРѕРµ' },
  { key: 'folder.heart', label: 'РР·Р±СЂР°РЅРЅРѕРµ' },
  { key: 'folder.compass', label: 'РџСѓС‚РµС€РµСЃС‚РІРёСЏ' },
  { key: 'folder.tag', label: 'РўРµРіРё' },
  { key: 'folder.archive', label: 'РђСЂС…РёРІ' },
  { key: 'folder.cpu', label: 'Р–РµР»РµР·Рѕ' },
  { key: 'folder.layers', label: 'РЎР»РѕРё' },
  { key: 'folder.bookmark', label: 'Р—Р°РєР»Р°РґРєРё' },
  { key: 'folder.lightbulb', label: 'РњС‹СЃР»Рё' },
];
