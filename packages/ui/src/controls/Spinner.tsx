import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { useHugoTheme } from '../theme';

/**
 * Activity indicator in the accent colour.
 *
 * @usage Short waits where the layout is already known: a button that is saving, a list that is loading its first page.
 * @remarks Wraps the platform activity indicator; every prop of it is accepted and `color` defaults to the accent colour.
 * @a11y Pair it with text or an accessibilityLabel that says what is loading.
 * @example <Spinner />
 * @example <Spinner size="small" color="#fff" />
 */
export default function Spinner({ color, ...rest }: ActivityIndicatorProps) {
  const { colors } = useHugoTheme();
  return <ActivityIndicator color={color ?? colors.accent} {...rest} />;
}
