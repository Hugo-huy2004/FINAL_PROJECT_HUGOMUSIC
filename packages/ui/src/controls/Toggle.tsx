import { Switch } from 'react-native';
import { useHugoTheme } from '../theme';

/**
 * On/off switch in the accent colour, using the platform's own switch.
 *
 * @usage Settings that take effect immediately. If a change needs confirmation or a Save step, use a checkbox-style row instead.
 * @remarks Wraps the native switch, so it gets the platform's haptics, animation and sizing for free.
 * @a11y Give it an `accessibilityLabel` unless a visible label sits in the same row and describes it.
 * @example <Toggle value={soundCheck} onValueChange={setSoundCheck} accessibilityLabel="Sound Check" />
 */
export default function Toggle({ value, onValueChange, accessibilityLabel }: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Required when there is no visible label next to the switch. */
  accessibilityLabel?: string;
}) {
  const { colors } = useHugoTheme();
  return <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: colors.fill }} accessibilityLabel={accessibilityLabel} />;
}
