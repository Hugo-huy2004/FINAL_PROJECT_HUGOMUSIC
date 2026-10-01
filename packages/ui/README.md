# Hugo Music

Frosted-glass UI kit with droplet motion for React Native and Expo. One codebase for native apps and the web: translucent glass surfaces that blur what scrolls behind them, controls that squash and spring back like drops of water, and a calm layout system built on large titles, grouped lists and generous touch targets.

## Install

```
npx expo install hugo-music @expo/vector-icons expo-blur expo-glass-effect expo-linear-gradient react-native-safe-area-context
```

The peer packages provide icons, blur, the native glass material, gradients and safe-area insets. Nothing else is required; the kit has no other UI dependency. Import icons and gradients from the kit too (`Icon`, `Gradient`) so your app depends on a single UI package.

## Quick start

```
import { HugoProvider, LargeTitle, InsetGroup, ListRow, Toggle, ActionButton } from 'hugo-music';

export default function Settings() {
  const [soundCheck, setSoundCheck] = useState(true);
  return (
    <HugoProvider scheme="system">
      <LargeTitle title="Settings" />
      <InsetGroup header="Playback" footer="Sound Check plays every song at the same volume.">
        <ListRow icon="volume-high-outline" title="Sound Check"
          right={<Toggle value={soundCheck} onValueChange={setSoundCheck} accessibilityLabel="Sound Check" />} />
      </InsetGroup>
      <ActionButton title="Done" size="lg" onPress={close} />
    </HugoProvider>
  );
}
```

`HugoProvider` is optional. Without it every component follows the device appearance with the default green accent.

## Frosted glass

`Glass` is the material under every floating control. It blurs and saturates what is behind it, adds a soft sheen on the upper half and a bright rim along the edge.

- **regular** — the default, for bars, toolbars and buttons.
- **clear** — thinner and more see-through, for controls floating over artwork or video.
- **tint** — colours the glass for prominent actions (a primary button, a selected state).
- **interactive** — the surface reacts to touch where the platform supports it.

Use glass for the layer that floats above content. Keep reading material — long text, lists, forms — on solid surfaces so it stays legible.

## Droplet motion

Pressing a glass control squashes it (a little wider, a little shorter); releasing bounces it back on an under-damped spring, so it overshoots and wobbles before settling — like a drop landing on glass. Selection lenses in `SegmentedControl` and `GlassTabBar` slide on a spring and stretch while they move. `useDroplet()` exposes the same physics for your own components.

## Theming

- `useHugoTheme()` returns `{ isDark, colors }`: semantic colours (`background`, `surface`, `text`, `textSecondary`, `border`, `accent`…) plus the glass fills.
- `HugoProvider scheme="light" | "dark" | "system"` forces an appearance; `accent` overrides the brand colour per appearance.
- `renderArtwork` replaces how every cover is drawn — one place to route images through a CDN or a cache.

## Layout and spacing

Tokens replace magic numbers: `space` (a 4-point grid), `radius`, `type` (Large Title 34 down to Caption 12), `TOUCH` (44-point minimum target) and `GUTTER` (content margin). `LargeTitle`, `Shelf`, `InsetGroup` and `ListRow` already apply them, so screens built from them line up without extra styling.

## Accessibility

- Icon-only controls take a required `label` that screen readers announce.
- Roles and states are set for you: tabs, selected items, adjustable date wheels, menus.
- Touch targets are at least 44 points.
- When the user asks for reduced transparency, glass becomes an opaque surface.

## Platform behaviour

| Where | Glass | Date picker | Context menu |
|---|---|---|---|
| Native, newest system glass | native glass material, interactive | wheels | glass menu |
| Native, other versions | system blur material | wheels | glass menu |
| Browsers | CSS backdrop blur with sheen and rim | browser date input | glass menu (long-press) |
| Native without blur | opaque fill | wheels | glass menu |

## Components

| Group | Components |
|---|---|
| Theme | `HugoProvider`, `useHugoTheme`, `useTone`, `space`, `radius`, `type`, `TOUCH`, `GUTTER`, `gradientFor`, `Icon`, `Gradient` |
| Glass | `Glass`, `GlassGroup`, `useDroplet` |
| Controls | `GlassButton`, `CapsuleButton`, `GlassCapsule`, `DropletPressable`, `ActionButton`, `SegmentedControl`, `Chips`, `Toggle`, `TextField`, `FormField`, `SearchField`, `DatePicker`, `ContextMenu`, `Spinner` |
| Navigation | `GlassTabBar`, `NavigationSidebar`, `BackButton`, `Sheet` |
| Layout | `LargeTitle`, `SectionHeader`, `Shelf`, `ListRow`, `InsetGroup`, `MediaTile`, `GradientTile`, `PinnedRow`, `GlassArt`, `Artwork` |
| Data display | `Card`, `StatCard`, `BarChart`, `Badge`, `EmptyState`, `Pager`, `ErrorText` |

Every component has its own page with props, usage notes, accessibility notes, examples and a live demo at `/developer/components` in the Hugo Music app.

## License

MIT
