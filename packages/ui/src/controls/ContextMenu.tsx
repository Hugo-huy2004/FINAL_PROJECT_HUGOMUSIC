import React, { cloneElement, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';

export type MenuItem = {
  key: string;
  label: string;
  /** Ionicons glyph shown on the trailing edge of the item. */
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
  /** Opens a submenu. */
  children?: MenuItem[];
};

const WIDTH = 250;

/**
 * Long-press menu in frosted glass, opened at the touch point, with submenus.
 *
 * @usage Quick actions on an item that also has a primary tap action (a song row: tap plays, long-press shows Play next, Add to playlist, Share). Every action in the menu should also be reachable another way.
 * @remarks The child must accept `onLongPress` (ListRow, MediaTile, Pressable…). The menu is 250 points wide, clamped inside the screen; items with `children` open a submenu with a Back row. Destructive items are red.
 * @a11y The menu has the menu role and items the menuitem role; tapping the dimmed backdrop closes it.
 * @example <ContextMenu items={[
 *   { key: 'play', label: 'Play', icon: 'play', onPress: play },
 *   { key: 'add', label: 'Add to playlist', icon: 'add-circle-outline', children: playlists },
 *   { key: 'remove', label: 'Remove', icon: 'trash-outline', destructive: true, onPress: remove },
 * ]}>
 *   <ListRow title={song.title} onPress={play} />
 * </ContextMenu>
 */
export default function ContextMenu({ items, children, backLabel = 'Back' }: {
  items: MenuItem[];
  /** The pressable to long-press; it receives `onLongPress`. */
  children: React.ReactElement;
  /** Label of the row that leaves a submenu. */
  backLabel?: string;
}) {
  const { colors } = useHugoTheme();
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [stack, setStack] = useState<MenuItem[][]>([]);
  const [menuH, setMenuH] = useState(0);
  const close = () => { setAt(null); setStack([]); };
  const open = (e: GestureResponderEvent) => { setAt({ x: e?.nativeEvent?.pageX ?? width / 2, y: e?.nativeEvent?.pageY ?? height / 2 }); setStack([items]); };
  const list = stack[stack.length - 1] || [];
  const left = at ? Math.max(8, Math.min(at.x - WIDTH / 2, width - WIDTH - 8)) : 0;
  const top = at ? Math.max(12, Math.min(at.y + 8, height - menuH - 12)) : 0;

  const row = (label: string, icon: React.ReactNode, onPress: () => void, color: string, first: boolean, key: string) => (
    <Pressable key={key} onPress={onPress} style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="menuitem" accessibilityLabel={label}>
      <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
      {icon}
    </Pressable>
  );

  return (
    <>
      {cloneElement(children as React.ReactElement<{ onLongPress?: (e: GestureResponderEvent) => void }>, { onLongPress: open })}
      <Modal transparent visible={!!at} animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close menu" />
        <Glass radius={14} style={[styles.menu, { left, top, width: WIDTH }]} onLayout={(e) => setMenuH(e.nativeEvent.layout.height)} accessibilityRole="menu">
          {stack.length > 1 && row(backLabel, <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />, () => setStack(stack.slice(0, -1)), colors.textSecondary, true, '__back')}
          {list.map((it, i) => row(
            it.label,
            <Ionicons name={it.children ? 'chevron-forward' : it.icon ?? 'ellipse-outline'} size={18} color={it.destructive ? '#FF3B30' : colors.text} />,
            () => { if (it.children) setStack([...stack, it.children]); else { close(); it.onPress?.(); } },
            it.destructive ? '#FF3B30' : colors.text,
            i === 0 && stack.length === 1,
            it.key,
          ))}
        </Glass>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  menu: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 44 },
  label: { fontSize: 17, flex: 1 },
});
