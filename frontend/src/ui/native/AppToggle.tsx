import { Switch } from 'react-native';
import { useAppTheme } from '../../theme/theme';

// Công tắc bật/tắt. Android/web: Switch của RN. iPhone: Toggle SwiftUI (AppToggle.ios.tsx).
export type AppToggleProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel?: string;
};

export default function AppToggle({ value, onValueChange, accessibilityLabel }: AppToggleProps) {
  const { colors } = useAppTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.accent, false: colors.fill }}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
