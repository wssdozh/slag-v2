// The one icon config: a semantic name per glyph, grouped by meaning.
// Change a glyph here and every call site follows — nothing else imports an icon set.
//
// Iconoir carries the set. The four Lucide leftovers are glyphs Iconoir simply does not
// have (a spinner, a dashed circle for the backlog column, and the H1/H2 marks): they are
// pinned below with an explicit comment, not forgotten.
import type { ComponentType, SVGProps } from 'react';
import {
  Activity,
  AntennaSignal,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Attachment,
  Bank,
  Bell,
  Bold,
  Book,
  Bookmark,
  Bug,
  Camera,
  Calendar,
  Check,
  CheckCircle,
  CheckSquare,
  Circle,
  Clock,
  ClockRotateRight,
  CloudSync,
  CloudUpload,
  Code,
  CodeBrackets,
  CoffeeCup,
  Collapse,
  Compass,
  Computer,
  ControlSlider,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Download,
  DownloadCircle,
  Drag,
  EditPencil,
  Enlarge,
  Expand,
  Eye,
  EyeClosed,
  Filter,
  FilterList,
  FireFlame,
  Flash,
  Folder,
  FolderMinus,
  FolderPlus,
  Forward,
  Gamepad,
  Gift,
  GitCompare,
  Globe,
  GraduationCap,
  GraphUp,
  Group,
  HardDrive,
  Hashtag,
  Heart,
  HomeSimple,
  InfoCircle,
  Italic,
  Journal,
  KanbanBoard,
  Key,
  KeyCommand,
  Laptop,
  Leaf,
  LightBulb,
  Link,
  List,
  Lock,
  LockSlash,
  LogOut,
  MailIn,
  MediaImage,
  MediaImageList,
  MediaImageXmark,
  Microphone,
  Minus,
  MoreHoriz,
  MoreVert,
  MusicNote,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  NavArrowUp,
  Notes,
  OpenBook,
  OpenNewWindow,
  Page,
  PageMinus,
  Palette,
  Pause,
  Pin,
  Play,
  Playlist,
  PlugTypeC,
  Plus,
  PlusCircle,
  Quote,
  Redo,
  Reduce,
  Refresh,
  RefreshDouble,
  Reply,
  Reports,
  Rewind,
  Repeat,
  RepeatOnce,
  Rocket,
  Search,
  Server,
  Settings,
  SettingsProfiles,
  Shield,
  Shuffle,
  SkipNext,
  SkipPrev,
  SmartphoneDevice,
  Sort,
  SortDown,
  SortUp,
  SoundHigh,
  SoundOff,
  Sparks,
  Square,
  Strikethrough,
  Suitcase,
  Table,
  TaskList,
  Terminal,
  Trash,
  Trophy,
  Undo,
  Upload,
  User,
  ViewColumns3,
  ViewGrid,
  ViewStructureDown,
  VideoCamera,
  WarningCircle,
  WarningTriangle,
  Wifi,
  Wrench,
  Xmark,
  ZoomIn,
} from 'iconoir-react';
// Iconoir has no counterpart for these four; swapping them out means drawing them.
import { CircleDashed, Heading1, Heading2, Loader2 } from 'lucide-react';

/**
 * A glyph component. Deliberately structural, not tied to one package: any icon set whose
 * component is an SVG element taking standard props can hold a registry slot.
 */
export type GlyphComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * A plain glyph, or a glyph that always wears extra classes
 * (a spinner that spins, so fifteen call sites stop repeating `animate-spin`).
 */
export type IconEntry = GlyphComponent | { icon: GlyphComponent; className: string };

/**
 * The whole set. Keys are `group.name`, derived from meaning, never from the glyph:
 * swapping a glyph is one line and every call site follows.
 */
export const ICONS = {
  // ─── nav: where it leads ───────────────────────────────────────────────
  'nav.back': ArrowLeft,
  'nav.forward': ArrowRight,
  'nav.prev': NavArrowLeft,
  'nav.next': NavArrowRight,
  'nav.up': NavArrowUp,
  'nav.down': NavArrowDown,
  'nav.open': ArrowUpRight,
  'nav.externalLink': OpenNewWindow,

  // ─── action: what it does to something ─────────────────────────────────
  'action.close': Xmark,
  'action.add': Plus,
  'action.addCircle': PlusCircle,
  'action.decrement': Minus,
  'action.moveUp': ArrowUp,
  'action.moveDown': ArrowDown,
  'action.send': ArrowUp,
  'action.check': Check,
  'action.delete': Trash,
  'action.edit': EditPencil,
  'action.rename': EditPencil,
  'action.copy': Copy,
  'action.search': Search,
  'action.filter': Filter,
  'action.refresh': Refresh,
  'action.retry': RefreshDouble,
  'action.undo': Undo,
  'action.redo': Redo,
  'action.more': MoreVert,
  'action.moreHorizontal': MoreHoriz,
  'action.download': Download,
  'action.upload': CloudUpload,
  'action.uploadFile': Upload,
  'action.link': Link,
  'action.pin': Pin,
  'action.reply': Reply,
  'action.attach': Attachment,
  'action.expand': Expand,
  'action.collapse': Collapse,
  'action.expandPane': Enlarge,
  'action.collapsePane': Reduce,
  'action.preview': Eye,
  'action.reveal': Eye,
  'action.hide': EyeClosed,
  'action.lock': Lock,
  'action.sort': Sort,
  'action.sortAsc': SortUp,
  'action.sortDesc': SortDown,
  'action.archive': Archive,
  'action.restore': Undo,
  'action.logout': LogOut,
  'action.diff': GitCompare,
  'action.dragHandle': Drag,
  'action.folderAdd': FolderPlus,
  'action.folderMove': FolderMinus,

  // ─── format: markdown and text marks ───────────────────────────────────
  'format.bold': Bold,
  'format.italic': Italic,
  'format.strike': Strikethrough,
  'format.h1': Heading1, // Iconoir has no heading glyphs
  'format.h2': Heading2, // Iconoir has no heading glyphs
  'format.list': List,
  'format.quote': Quote,
  'format.code': Code,
  'format.table': Table,

  // ─── entity: what kind of thing it is ──────────────────────────────────
  'entity.note': Notes,
  'entity.task': CheckSquare,
  'entity.article': Journal,
  'entity.folder': Folder,
  'entity.folderOpen': Folder, // Iconoir has no open-folder glyph
  'entity.folderSynced': CloudSync,
  'entity.folderFilter': FilterList,
  'entity.folderInfo': InfoCircle,
  'entity.inbox': MailIn,
  'entity.vault': Database,
  'entity.tag': Hashtag,
  'entity.tagHash': Hashtag,
  'entity.kanban': KanbanBoard,
  'entity.layers': ViewStructureDown,
  'entity.materials': OpenBook,
  'entity.link': Link,
  'entity.taskList': TaskList,
  'entity.archive': Archive,
  'entity.versions': ClockRotateRight,
  'entity.disk': HardDrive,
  'entity.file': Page,
  'entity.fileCode': CodeBrackets,
  'entity.fileMissing': PageMinus,
  'entity.image': MediaImage,
  'entity.images': MediaImageList,
  'entity.imageMissing': MediaImageXmark,
  'entity.attachmentMissing': PageMinus,
  'entity.user': User,
  'entity.desktop': Laptop,
  'entity.phone': SmartphoneDevice,

  // ─── time: dates, clocks, recurrence ───────────────────────────────────
  'time.date': Calendar,
  'time.calendar': Calendar,
  'time.time': Clock,
  'time.repeat': Repeat,
  'time.repeatOne': RepeatOnce,
  'time.agenda': TaskList,
  'time.threeDay': ViewColumns3,

  // ─── status: the state of a thing ──────────────────────────────────────
  'status.loading': { icon: Loader2, className: 'animate-spin' }, // no Iconoir spinner
  'status.backlog': CircleDashed, // no Iconoir dashed circle
  'status.todo': Circle,
  'status.unchecked': Circle,
  'status.done': CheckCircle,
  'status.checked': Check,
  'status.success': CheckCircle,
  'status.alert': WarningCircle,
  'status.warning': WarningTriangle,
  'status.info': InfoCircle,
  'status.urgent': FireFlame,
  'status.priority': Flash,
  'status.locked': Lock,
  'status.unlocked': LockSlash,
  'status.live': AntennaSignal,

  // ─── media: transport, capture, sound ──────────────────────────────────
  'media.play': Play,
  'media.pause': Pause,
  'media.skipBack': SkipPrev,
  'media.skipForward': SkipNext,
  'media.seekBack': Rewind,
  'media.seekForward': Forward,
  'media.shuffle': Shuffle,
  'media.volumeOn': SoundHigh,
  'media.volumeOff': SoundOff,
  'media.microphone': Microphone,
  'media.camera': Camera,
  'media.video': VideoCamera,
  'media.music': MusicNote,
  'media.queue': Playlist,
  'media.zoomIn': ZoomIn,

  // ─── system: the app itself ────────────────────────────────────────────
  'system.ai': Sparks,
  'system.logs': Terminal,
  'system.sync': Refresh,
  'system.update': DownloadCircle,
  'system.web': Globe,
  'system.settings': Settings,
  'system.command': KeyCommand,
  'system.keyEnter': KeyCommand,
  'system.shortcuts': KeyCommand,
  'system.security': Shield,
  'system.secretKey': Key,
  'system.desktopMode': Computer,
  'system.integrations': PlugTypeC,
  'system.integrationConfig': SettingsProfiles,
  'system.connectionTest': Wifi,
  'system.notifications': Bell,
  'system.appearance': ControlSlider,
  'system.panelFeed': ViewGrid,
  'system.windowMinimize': Minus,
  'system.windowMaximize': Square,
  'system.windowClose': Xmark,

  // ─── admin: the relay console ──────────────────────────────────────────
  'admin.activity': Activity,
  'admin.chart': Reports,
  'admin.billing': CreditCard,
  'admin.server': Server,
  'admin.trend': GraphUp,
  'admin.users': Group,
  'admin.maintenance': Wrench,

  // ─── folder: the picker a folder chooses its own glyph from ────────────
  'folder.generic': Folder,
  'folder.code': CodeBrackets,
  'folder.briefcase': Suitcase,
  'folder.book': Book,
  'folder.flame': FireFlame,
  'folder.sparkles': Sparks,
  'folder.coffee': CoffeeCup,
  'folder.heart': Heart,
  'folder.compass': Compass,
  'folder.tag': Hashtag,
  'folder.archive': Archive,
  'folder.cpu': Cpu,
  'folder.layers': ViewStructureDown,
  'folder.bookmark': Bookmark,
  'folder.lightbulb': LightBulb,
  'folder.music': MusicNote,
  'folder.camera': Camera,
  'folder.home': HomeSimple,
  'folder.games': Gamepad,
  'folder.gift': Gift,
  'folder.bug': Bug,
  'folder.milestones': Trophy,
  'folder.finance': Bank,
  'folder.study': GraduationCap,
  'folder.art': Palette,
  'folder.health': Leaf,
  'folder.startup': Rocket,
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
 */
export const LEGACY_FOLDER_ICONS: Record<string, IconName> = {
  Folder: 'folder.generic',
  Code2: 'folder.code',
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
};

/** Resolves whatever a folder's meta carries — a registry key or a legacy lucide name. */
export function folderIconName(stored: string | undefined | null): IconName {
  if (!stored) return 'folder.generic';
  if (stored in ICONS) return stored as IconName;
  return LEGACY_FOLDER_ICONS[stored] ?? 'folder.generic';
}

/** The picker grid: one entry per selectable folder glyph, in display order. */
export const FOLDER_ICON_CHOICES: ReadonlyArray<{ key: IconName; label: string }> = [
  { key: 'folder.generic', label: 'Папка' },
  { key: 'folder.code', label: 'Код' },
  { key: 'folder.briefcase', label: 'Работа' },
  { key: 'folder.book', label: 'Книга' },
  { key: 'folder.flame', label: 'Срочное' },
  { key: 'folder.sparkles', label: 'ИИ' },
  { key: 'folder.coffee', label: 'Личное' },
  { key: 'folder.heart', label: 'Избранное' },
  { key: 'folder.compass', label: 'Путешествия' },
  { key: 'folder.tag', label: 'Теги' },
  { key: 'folder.archive', label: 'Архив' },
  { key: 'folder.cpu', label: 'Железо' },
  { key: 'folder.layers', label: 'Слои' },
  { key: 'folder.bookmark', label: 'Закладки' },
  { key: 'folder.lightbulb', label: 'Мысли' },
  { key: 'folder.music', label: 'Музыка' },
  { key: 'folder.camera', label: 'Фото' },
  { key: 'folder.home', label: 'Дом' },
  { key: 'folder.games', label: 'Игры' },
  { key: 'folder.gift', label: 'Подарки' },
  { key: 'folder.bug', label: 'Баги' },
  { key: 'folder.milestones', label: 'Цели' },
  { key: 'folder.finance', label: 'Финансы' },
  { key: 'folder.study', label: 'Учёба' },
  { key: 'folder.art', label: 'Творчество' },
  { key: 'folder.health', label: 'Здоровье' },
  { key: 'folder.startup', label: 'Стартап' },
];
