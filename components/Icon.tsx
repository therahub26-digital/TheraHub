"use client";

import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  BarChart3, Bell, BellRing, BookOpen, Building, Building2, Calendar, CalendarClock,
  CalendarDays, CalendarPlus, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleDollarSign, CircleEllipsis, ClipboardList, Clock, Coins,
  CreditCard, Crown, Database, DoorOpen, Download, Droplet, Edit3, Ellipsis, Eye, Filter,
  Flag, Flower2, Footprints, Gem, Grid3x3, Hand, HandHeart, HeartHandshake, History, Home,
  Hourglass, Info, Layers, LayoutDashboard, LifeBuoy, LineChart, ListChecks, ListTodo, Lock,
  LogOut, MapPin, MapPinCheck, Megaphone, Menu, MessageSquare, Minus, MoreHorizontal,
  Package, PackageSearch, Pause, Percent, Phone, PieChart, Play, Plug, Plus, Printer, Radar,
  Receipt, RefreshCw, Repeat, RotateCcw, ScanLine, ScrollText, Search, Send, Settings,
  Settings2, Shield, ShieldCheck, Shirt, ShoppingCart, SlidersHorizontal, Sparkles, Square,
  Star, Sun, Tag, Timer, TrendingDown, TrendingUp, Ticket, Trash2, Truck, User, UserCheck, UserX,
  UserRound, Users, Wallet, Wrench, X, XCircle, Zap, QrCode, Banknote, Smartphone,
  FileText, Upload, ExternalLink, Copy, Bookmark, ThumbsUp, Wifi, WifiOff, Save, Share2,
  ChevronsUpDown, CircleCheck, CircleAlert, Utensils, Coffee, Boxes, ArrowLeftRight,
  ClipboardCheck, Fingerprint, Navigation, Gauge, Target, Award, Cake, Waves,
  PiggyBank, Gift, TowerControl, Cctv, ScanFace, Route, Warehouse,
  ClipboardX, BadgeCheck, CircleDot, Layers3, PartyPopper, HandCoins, Calculator,
  Moon, Car, Wind, Camera, Images, Archive, MapPinned,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<{ size?: number | string; strokeWidth?: number; className?: string; style?: React.CSSProperties }>> = {
  activity: Activity, "alert-triangle": AlertTriangle, "arrow-down-right": ArrowDownRight,
  "arrow-left": ArrowLeft, "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight,
  "arrow-left-right": ArrowLeftRight, award: Award, "bar-chart-3": BarChart3, banknote: Banknote,
  bell: Bell, "bell-ring": BellRing, "book-open": BookOpen, bookmark: Bookmark, boxes: Boxes,
  building: Building, "building-2": Building2, cake: Cake, calendar: Calendar,
  "calendar-clock": CalendarClock, "calendar-days": CalendarDays, "calendar-plus": CalendarPlus,
  check: Check, "check-check": CheckCheck, "check-circle": CheckCircle2, "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft, "chevron-right": ChevronRight, "chevron-up": ChevronUp,
  "chevrons-up-down": ChevronsUpDown, "circle-alert": CircleAlert, "circle-check": CircleCheck,
  "circle-dollar": CircleDollarSign, "circle-ellipsis": CircleEllipsis, "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList, clock: Clock, coffee: Coffee, coins: Coins, copy: Copy,
  "credit-card": CreditCard, crown: Crown, database: Database, "door-open": DoorOpen,
  download: Download, droplet: Droplet, edit: Edit3, ellipsis: Ellipsis, "external-link": ExternalLink,
  eye: Eye, "file-text": FileText, filter: Filter, fingerprint: Fingerprint, flag: Flag,
  flower: Flower2, footprints: Footprints, gauge: Gauge, gem: Gem, grid: Grid3x3, hand: Hand,
  "hand-heart": HandHeart, "heart-handshake": HeartHandshake, history: History, home: Home,
  hourglass: Hourglass, info: Info, layers: Layers, "layout-dashboard": LayoutDashboard,
  "life-buoy": LifeBuoy, "line-chart": LineChart, "list-checks": ListChecks, "list-todo": ListTodo,
  lock: Lock, "log-out": LogOut, "map-pin": MapPin, "map-pin-check": MapPinCheck,
  megaphone: Megaphone, menu: Menu, "message-square": MessageSquare, minus: Minus,
  more: MoreHorizontal, navigation: Navigation, package: Package, "package-search": PackageSearch,
  pause: Pause, percent: Percent, phone: Phone, "pie-chart": PieChart, play: Play, plug: Plug,
  plus: Plus, printer: Printer, "qr-code": QrCode, radar: Radar, receipt: Receipt,
  refresh: RefreshCw, repeat: Repeat, "rotate-ccw": RotateCcw, save: Save, "scan-line": ScanLine,
  "scroll-text": ScrollText, search: Search, send: Send, settings: Settings, "settings-2": Settings2,
  share: Share2, shield: Shield, "shield-check": ShieldCheck, shirt: Shirt,
  "shopping-cart": ShoppingCart, "sliders-horizontal": SlidersHorizontal, smartphone: Smartphone,
  sparkles: Sparkles, square: Square, star: Star, sun: Sun, target: Target, "thumbs-up": ThumbsUp,
  tag: Tag, ticket: Ticket, timer: Timer, trash: Trash2, "trending-down": TrendingDown,
  "trending-up": TrendingUp, truck: Truck, upload: Upload, user: User, "user-check": UserCheck,
  "user-round": UserRound, "user-x": UserX, users: Users, utensils: Utensils, wallet: Wallet, waves: Waves,
  wifi: Wifi, "wifi-off": WifiOff, wrench: Wrench, x: X, "x-circle": XCircle, "circle-x": XCircle, zap: Zap,
  "piggy-bank": PiggyBank, gift: Gift, "tower-control": TowerControl,
  cctv: Cctv, "scan-face": ScanFace, route: Route, warehouse: Warehouse,
  "clipboard-x": ClipboardX, "badge-check": BadgeCheck, "circle-dot": CircleDot,
  "layers-3": Layers3, "party-popper": PartyPopper, "hand-coins": HandCoins,
  calculator: Calculator, moon: Moon, car: Car, wind: Wind, camera: Camera, images: Images,
  // Aliases. An unknown name silently falls back to CircleEllipsis ("…"),
  // so a typo is invisible in review and only shows up as a meaningless
  // icon on screen. These two were already in use: every booking/cancel
  // error message in the app asked for "triangle-alert" (lucide's newer
  // spelling of AlertTriangle) and drew "…" next to the error text
  // instead of a warning sign; the photo gallery asked for "image".
  "triangle-alert": AlertTriangle, image: Images,
  // Added 2026-08-24 with the room/geofence editors that use them.
  archive: Archive, "map-pinned": MapPinned,
};

export default function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const C = MAP[name] ?? CircleEllipsis;
  return <C size={size} strokeWidth={strokeWidth} className={className} style={style} />;
}
