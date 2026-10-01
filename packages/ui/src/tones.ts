import { useHugoTheme } from './theme';

/** Semantic colour families for status labels, metrics and charts. */
export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray';

const LIGHT: Record<Tone, [string, string]> = {
  green: ['#07875F', '#E6F6EF'], red: ['#D92D20', '#FEECEB'], amber: ['#B54708', '#FEF4E6'],
  blue: ['#175CD3', '#EAF1FD'], violet: ['#6941C6', '#F2EEFD'], gray: ['#475467', '#EEF0F3'],
};
const DARK: Record<Tone, [string, string]> = {
  green: ['#32D74B', 'rgba(50,215,75,0.16)'], red: ['#FF6961', 'rgba(255,69,58,0.18)'], amber: ['#FFB340', 'rgba(255,159,10,0.18)'],
  blue: ['#64A8FF', 'rgba(10,132,255,0.2)'], violet: ['#BF8CFF', 'rgba(191,90,242,0.2)'], gray: ['#AEAEB2', 'rgba(142,142,147,0.2)'],
};

/** [foreground, background] of a tone in the current appearance. */
export function useTone(tone: Tone): [string, string] {
  return (useHugoTheme().isDark ? DARK : LIGHT)[tone];
}
