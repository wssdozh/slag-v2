// The one icon config: a semantic name per glyph, grouped by meaning.
// Change a glyph here and every call site follows — nothing else imports an icon set.
//
// Lucide carries the set: one stroke family, 24px grid, 2px weight, round caps.
// Lucide has no filled twins, so "filled" is not a second glyph here — `Icon` fills the
// same outline when a call site toggles a thing on (an active dock tab, a pinned note).
// That is why every value below is a bare glyph and the `filled` slot stays empty.
import type { ComponentType, SVGProps } from 'react';
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ArrowUpRight,
  AudioWaveform,
  Bell,
  Bold,
  Book,
  BookOpen,
  Bookmark,
  Braces,
  Briefcase,
  Calendar,
  Camera,
  ChartBar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleArrowDown,
  CircleCheck,
  CircleDashed,
  CirclePlus,
  Clock,
  ClockArrowLeft,
  CloudCheck,
  CloudUpload,
  Code,
  Coffee,
  Columns3,
  Command,
  Compass,
  Copy,
  CornerDownLeft,
  CornerUpLeft,
  Cpu,
  CreditCard,
  Database,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FastForward,
  File,
  FileCode,
  FileMinus,
  Flame,
  Folder,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  GitCompare,
  Globe,
  GripVertical,
  Hash,
  Heading1,
  Heading2,
  Heart,
  Image,
  ImageOff,
  Images,
  Inbox,
  Info,
  Italic,
  Kanban,
  Key,
  Keyboard,
  Laptop,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListFilter,
  ListMusic,
  LoaderCircle,
  Lock,
  LockOpen,
  LogOut,
  Maximize,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize,
  Minimize2,
  Minus,
  Monitor,
  Music,
  Network,
  Newspaper,
  NotebookPen,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  Quote,
  Radio,
  Redo2,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  SquareCheck,
  Strikethrough,
  Table,
  Tag,
  Terminal,
  Trash,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Upload,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  Wrench,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';

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

/**
 * The whole set. Keys are `group.name`, derived from meaning, never from the glyph:
 * swapping a glyph is one line and every call site follows.
 */
export const ICONS = {
  // в”Ђв”Ђв”Ђ nav: where it leads в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'nav.back': ArrowLeft,
  'nav.forward': ArrowRight,
  'nav.prev': ChevronLeft,
  'nav.next': ChevronRight,
  'nav.up': ChevronUp,
  'nav.down': ChevronDown,
  'nav.open': ArrowUpRight,
  'nav.externalLink': ExternalLink,

  // в”Ђв”Ђв”Ђ action: what it does to something в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'action.close': X,
  'action.add': Plus,
  'action.addCircle': CirclePlus,
  'action.decrement': Minus,
  'action.moveDown': ArrowDown,
  'action.send': Send,
  'action.check': Check,
  'action.delete': Trash,
  'action.edit': Pencil,
  'action.rename': Pencil,
  'action.copy': Copy,
  'action.search': Search,
  'action.filter': ListFilter,
  'action.refresh': RefreshCw,
  'action.retry': RotateCcw,
  'action.undo': Undo2,
  'action.redo': Redo2,
  'action.more': EllipsisVertical,
  'action.moreHorizontal': Ellipsis,
  'action.download': Download,
  'action.upload': CloudUpload,
  'action.uploadFile': Upload,
  'action.link': Link,
  'action.pin': Pin,
  'action.reply': CornerUpLeft,
  'action.attach': Paperclip,
  'action.expand': Maximize,
  'action.collapse': Minimize,
  'action.expandPane': Maximize2,
  'action.collapsePane': Minimize2,
  'action.preview': Eye,
  'action.hide': EyeOff,
  'action.lock': Lock,
  'action.sort': ArrowUpDown,
  'action.sortAsc': ArrowUpNarrowWide,
  'action.sortDesc': ArrowDownWideNarrow,
  'action.archive': Archive,
  'action.restore': ArchiveRestore,
  'action.logout': LogOut,
  'action.diff': GitCompare,
  'action.dragHandle': GripVertical,
  'action.folderAdd': FolderPlus,
  'action.folderMove': FolderMinus,
  'action.transcribe': AudioWaveform,

  // в”Ђв”Ђв”Ђ format: markdown and text marks в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'format.bold': Bold,
  'format.italic': Italic,
  'format.strike': Strikethrough,
  'format.h1': Heading1,
  'format.h2': Heading2,
  'format.list': List,
  'format.quote': Quote,
  'format.code': Code,
  'format.table': Table,

  // в”Ђв”Ђв”Ђ entity: what kind of thing it is в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'entity.note': NotebookPen,
  'entity.task': SquareCheck,
  'entity.article': Newspaper,
  'entity.folder': Folder,
  'entity.folderOpen': FolderOpen,
  'entity.folderSynced': CloudCheck,
  'entity.folderFilter': ListFilter,
  'entity.folderInfo': Info,
  'entity.inbox': Inbox,
  'entity.vault': Database,
  'entity.tag': Hash,
  'entity.tagHash': Hash,
  'entity.kanban': Kanban,
  'entity.layers': Network,
  'entity.materials': BookOpen,
  'entity.link': Link,
  'entity.taskList': ListChecks,
  'entity.versions': ClockArrowLeft,
  'entity.disk': Server,
  'entity.file': File,
  'entity.fileCode': FileCode,
  'entity.fileMissing': FileMinus,
  'entity.image': Image,
  'entity.images': Images,
  'entity.imageMissing': ImageOff,
  'entity.user': User,
  'entity.desktop': Laptop,
  'entity.phone': Smartphone,
  'entity.telegram': MessageCircle,

  // в”Ђв”Ђв”Ђ time: dates, clocks, recurrence в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'time.date': Calendar,
  'time.calendar': Calendar,
  'time.time': Clock,
  'time.repeat': Repeat,
  'time.repeatOne': Repeat1,
  'time.threeDay': Columns3,

  // в”Ђв”Ђв”Ђ status: the state of a thing в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'status.loading': { icon: LoaderCircle, className: 'animate-spin' },
  'status.backlog': CircleDashed,
  'status.todo': Circle,
  'status.done': CircleCheck,
  'status.alert': CircleAlert,
  'status.warning': TriangleAlert,
  'status.info': Info,
  'status.urgent': Flame,
  'status.priority': Zap,
  'status.unlocked': LockOpen,
  'status.live': Radio,

  // в”Ђв”Ђв”Ђ media: transport, capture, sound в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'media.play': Play,
  'media.pause': Pause,
  'media.skipBack': SkipBack,
  'media.skipForward': SkipForward,
  'media.seekForward': FastForward,
  'media.shuffle': Shuffle,
  'media.volumeOn': Volume2,
  'media.volumeOff': VolumeX,
  'media.microphone': Mic,
  'media.camera': Camera,
  'media.video': Video,
  'media.music': Music,
  'media.queue': ListMusic,
  'media.zoomIn': ZoomIn,

  // в”Ђв”Ђв”Ђ system: the app itself в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'system.ai': Sparkles,
  'system.logs': Terminal,
  'system.sync': RefreshCw,
  'system.update': CircleArrowDown,
  'system.web': Globe,
  'system.settings': Settings,
  'system.command': Command,
  'system.keyEnter': CornerDownLeft,
  'system.shortcuts': Keyboard,
  'system.security': Shield,
  'system.secretKey': Key,
  'system.desktopMode': Monitor,
  'system.integrations': Plug,
  'system.integrationConfig': SlidersHorizontal,
  'system.connectionTest': Wifi,
  'system.notifications': Bell,
  'system.appearance': SlidersHorizontal,
  'system.windowMaximize': Square,

  // в”Ђв”Ђв”Ђ admin: the relay console в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'admin.activity': Activity,
  'admin.chart': ChartBar,
  'admin.billing': CreditCard,
  'admin.server': Server,
  'admin.trend': TrendingUp,
  'admin.users': Users,
  'admin.maintenance': Wrench,

  // в”Ђв”Ђв”Ђ folder: the picker a folder chooses its own glyph from в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  'folder.generic': Folder,
  'folder.code': Braces,
  'folder.briefcase': Briefcase,
  'folder.book': Book,
  'folder.flame': Flame,
  'folder.sparkles': Sparkles,
  'folder.coffee': Coffee,
  'folder.heart': Heart,
  'folder.compass': Compass,
  'folder.tag': Tag,
  'folder.archive': Archive,
  'folder.cpu': Cpu,
  'folder.layers': Network,
  'folder.bookmark': Bookmark,
  'folder.lightbulb': Lightbulb,
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

/** Resolves whatever a folder's meta carries — a registry key or a legacy lucide name. */
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
