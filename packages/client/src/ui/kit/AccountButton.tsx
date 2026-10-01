import { Pressable } from 'react-native';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../theme';
import { useIsMobile } from '../../lib/responsive';
import { UserAvatar } from '../../components/UserAvatar';
import { Icon } from 'hugo-music';

// Avatar in the right corner of the large title (like Apple Music) — account entrance + phone settings
// phone. Desktop already has an account section at the bottom of the sidebar so it doesn't appear.
/** Round avatar button in the top-right of a tab; opens the account screen or the sign-in sheet. */
export default function AccountButton({ onNavigate }: { /** Navigate to a tab id (e.g. 'account'). */ onNavigate: (tab: string) => void }) {
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
        <Icon name="person-circle" size={36} color={colors.accent} />
      )}
    </Pressable>
  );
}
