import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';
import ActionButton from '../controls/ActionButton';

/**
 * Sheet for a focused task on top of the current screen: a side panel on wide screens, a bottom sheet on phones,
 * with a frosted-glass header and an optional sticky footer.
 *
 * @usage Editing or inspecting one item without losing the list behind it (a song, a user, a room). Put the save action in `footer`.
 * @remarks At 900 points and wider it slides in from the trailing edge (560 points wide); narrower it rises from the bottom up to 92 % of the height. Tapping the dimmed backdrop or the close button calls `onClose`.
 * @a11y The close button is labelled; the system back gesture and the Escape key also close it.
 * @example <Sheet visible={!!song} title={song?.title ?? ''} subtitle={song?.artist} onClose={() => setSong(null)} footer={<ActionButton title="Save" onPress={save} />}>
 *   <FormField label="Title" value={title} onChange={setTitle} />
 * </Sheet>
 */
export default function Sheet({ visible, title, subtitle, onClose, children, footer, closeLabel = 'Close' }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Sticky footer, usually the save button. */
  footer?: React.ReactNode;
  closeLabel?: string;
}) {
  const { colors } = useHugoTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.backdrop, wide && styles.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={closeLabel} />
        <View style={[styles.sheet, { backgroundColor: colors.background }, wide ? [styles.wide, { borderColor: colors.border }] : [styles.phone, { paddingBottom: insets.bottom }]]}>
          <Glass radius={0} style={[styles.head, { borderColor: colors.border }]}>
            <View style={styles.text}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <ActionButton variant="plain" size="sm" icon="close" accessibilityLabel={closeLabel} onPress={onClose} />
          </Glass>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          {footer ? <View style={[styles.foot, { borderColor: colors.border }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  backdropWide: { flexDirection: 'row', justifyContent: 'flex-end' },
  sheet: { overflow: 'hidden' },
  wide: { width: 560, maxWidth: '100%', height: '100%', borderLeftWidth: 1 },
  phone: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  body: { padding: 20 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, borderTopWidth: 1 },
});
