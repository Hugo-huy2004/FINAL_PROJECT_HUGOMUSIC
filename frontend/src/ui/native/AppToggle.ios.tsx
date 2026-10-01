import { Host, Toggle } from '@expo/ui/swift-ui';
import { labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme/theme';
import type { AppToggleProps } from './AppToggle';

// iPhone: Toggle SwiftUI (docs.expo.dev/versions/latest/sdk/ui/swift-ui/toggle) — nhãn ẩn nhưng
// VoiceOver vẫn đọc; hàng cài đặt bên ngoài đã có chữ.
export default function AppToggle({ value, onValueChange, accessibilityLabel }: AppToggleProps) {
  const { colors, isDark } = useAppTheme();
  return (
    <Host matchContents colorScheme={isDark ? 'dark' : 'light'}>
      <Toggle isOn={value} onIsOnChange={onValueChange} label={accessibilityLabel ?? ''} modifiers={[labelsHidden(), tint(colors.accent)]} />
    </Host>
  );
}
