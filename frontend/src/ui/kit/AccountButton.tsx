import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile } from '../../utils/responsive';
import { UserAvatar } from '../../components/UserAvatar';

// Avatar góc phải tiêu đề lớn (như Apple Music) — lối vào tài khoản + cài đặt trên điện
// thoại. Desktop đã có mục tài khoản ở đáy thanh bên nên không hiện.
export default function AccountButton({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  if (!isMobile) return null;
  return (
    <Pressable
      onPress={() => (user ? onNavigate('account') : setLoginModalVisible(true))}
      accessibilityRole="button"
      accessibilityLabel={user ? 'Tài khoản' : 'Đăng nhập'}
      hitSlop={8}
    >
      {user ? (
        <UserAvatar avatarUrl={user.avatarUrl} username={user.username} nickname={user.nickname} size={34} />
      ) : (
        <Ionicons name="person-circle" size={36} color={colors.accent} />
      )}
    </Pressable>
  );
}
