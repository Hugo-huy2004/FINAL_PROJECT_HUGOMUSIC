import { StyleSheet, Text, View } from 'react-native';
import { useHugoTheme } from '../theme';
import ActionButton from '../controls/ActionButton';

/**
 * Previous / next pagination with “page x of y · n items”.
 *
 * @usage Under long server-paginated tables. Renders nothing when everything fits on one page.
 * @remarks Pages are 1-based; the buttons disable themselves at the ends. `labels` localises the text.
 * @a11y The arrow buttons are named Previous page and Next page.
 * @example <Pager page={page} total={total} limit={30} onPage={setPage} />
 */
export default function Pager({ page, total, limit, onPage, labels = { previous: 'Previous page', next: 'Next page', page: 'Page', items: 'items' } }: {
  /** Current page, starting at 1. */
  page: number;
  /** Number of items across all pages. */
  total: number;
  /** Items per page. */
  limit: number;
  onPage: (page: number) => void;
  labels?: { previous: string; next: string; page: string; items: string };
}) {
  const { colors } = useHugoTheme();
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <View style={styles.row}>
      <ActionButton variant="glass" size="sm" icon="chevron-back" accessibilityLabel={labels.previous} onPress={() => onPage(page - 1)} disabled={page <= 1} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{labels.page} {page} / {pages} · {total.toLocaleString()} {labels.items}</Text>
      <ActionButton variant="glass" size="sm" icon="chevron-forward" accessibilityLabel={labels.next} onPress={() => onPage(page + 1)} disabled={page >= pages} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  text: { fontSize: 13 },
});
