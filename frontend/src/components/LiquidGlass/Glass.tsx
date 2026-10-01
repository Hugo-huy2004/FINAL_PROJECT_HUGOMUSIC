import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../../theme/theme';

// The one Liquid Glass material for the app's navigation layer (tab bar, sidebar,
// mini player, floating pills). Per Apple's HIG, glass belongs to controls that float
// above content — never to the content itself — so screens stay plain and artwork
// supplies the colour the glass picks up.
//
//   iOS       UIKit chrome material via expo-blur (systemChromeMaterial)
//   Android   near-opaque fill — expo-blur's Android blur needs a BlurTargetView
//             wrapping the whole screen, not worth it for a translucent bar
//   Web/PWA   backdrop-filter + specular rim, styled by [data-glass] in
//             public/index.html (react-native-web drops `className`, not `dataSet`)
type GlassProps = ViewProps & {
  radius?: number;
  interactive?: boolean;
  // Ép tông kính bất kể giao diện sáng/tối (vd. trình phát luôn nền tối → 'dark').
  tone?: 'light' | 'dark';
};

export default function Glass({ radius = 999, interactive = false, tone, style, children, ...rest }: GlassProps) {
  const theme = useAppTheme();
  const isDark = tone ? tone === 'dark' : theme.isDark;
  const colors = tone === 'dark' ? { ...theme.colors, glass: 'rgba(255,255,255,0.14)', glassSolid: 'rgba(60,60,64,0.9)', cardBorder: 'rgba(255,255,255,0.2)' } : theme.colors;
  const shape = { borderRadius: radius, overflow: 'hidden' as const };

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        intensity={100}
        style={[shape, styles.hairline, { borderColor: colors.cardBorder }, style]}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View
      {...rest}
      {...(Platform.OS === 'web' ? ({ dataSet: { glass: isDark ? 'dark' : 'light' } } as object) : {})}
      style={[
        shape,
        Platform.OS === 'web'
          ? { backgroundColor: colors.glass }
          : [styles.hairline, styles.androidShadow, { backgroundColor: colors.glassSolid, borderColor: colors.cardBorder }],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: { borderWidth: StyleSheet.hairlineWidth },
  androidShadow: { elevation: 6 },
});
