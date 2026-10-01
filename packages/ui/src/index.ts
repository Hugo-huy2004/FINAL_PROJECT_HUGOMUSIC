// hugo-music — frosted-glass UI kit with droplet motion for React Native and Expo (native and web).

// Theme, tokens and primitives
export { HugoProvider, useHugoTheme, lightColors, darkColors, type HugoColors, type ArtworkProps } from './theme';
export { space, radius, type, TOUCH, GUTTER, gradientFor } from './tokens';
export { useTone, type Tone } from './tones';
/** Icon set used by every component; import icons from here so the app depends on one UI package. */
export { Ionicons as Icon } from '@expo/vector-icons';
export type IconName = keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
/** Gradient fill (same props as the underlying gradient view). */
export { LinearGradient as Gradient } from 'expo-linear-gradient';

// Frosted glass
export { default as Glass, type GlassProps } from './glass/Glass';
export { default as GlassGroup } from './glass/GlassGroup';
export { useDroplet } from './glass/useDroplet';

// Controls
export { GlassButton, CapsuleButton, GlassCapsule, DropletPressable } from './controls/GlassButton';
export { default as ActionButton, type ActionButtonProps } from './controls/ActionButton';
export { default as Spinner } from './controls/Spinner';
export { default as Chips, type ChipOption } from './controls/Chips';
export { default as FormField } from './controls/FormField';
export { default as SegmentedControl, type Segment } from './controls/SegmentedControl';
export { default as Toggle } from './controls/Toggle';
export { default as TextField, type TextFieldProps, type AutofillKind } from './controls/TextField';
export { default as SearchField } from './controls/SearchField';
export { default as DatePicker, type DatePickerProps } from './controls/DatePicker';
export { default as ContextMenu, type MenuItem } from './controls/ContextMenu';

// Navigation
export { default as GlassTabBar, type TabItem } from './navigation/GlassTabBar';
export { default as BackButton } from './navigation/BackButton';
export { default as Sheet } from './navigation/Sheet';
export { default as NavigationSidebar, type SidebarItem, type SidebarSection } from './navigation/NavigationSidebar';

// Layout
export { default as LargeTitle } from './layout/LargeTitle';
export { default as Shelf, SectionHeader } from './layout/Shelf';
export { default as ListRow } from './layout/ListRow';
export { default as InsetGroup } from './layout/InsetGroup';
export { default as MediaTile } from './layout/MediaTile';
export { default as GradientTile } from './layout/GradientTile';
export { default as PinnedRow } from './layout/PinnedRow';
export { default as GlassArt } from './layout/GlassArt';
export { default as Artwork } from './layout/Artwork';

// Data display
export { default as Badge } from './data/Badge';
export { default as Card } from './data/Card';
export { default as StatCard } from './data/StatCard';
export { default as BarChart } from './data/BarChart';
export { default as EmptyState } from './data/EmptyState';
export { default as Pager } from './data/Pager';
export { default as ErrorText } from './data/ErrorText';
