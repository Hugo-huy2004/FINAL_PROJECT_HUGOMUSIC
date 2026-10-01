import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAdminAuth } from './hooks/useAdminAuth';
import AdminLogin from './components/AdminLogin';
import AdminDashboard, { AdminSection } from './AdminDashboard';
import { HugoProvider, Icon } from 'hugo-music';

// /admin (linking at src/navigation/AppNavigator.tsx). Admin access from Account › Manage music store
// or Library › Public Listening Room › Room Management (open directly to the Listening Room section).
type Props = { route?: { params?: { section?: AdminSection } } };

// The admin area uses the light admin palette (ui.tsx C), so the library components inside it render light too.
export default function AdminScreen(props: Props) {
  return <HugoProvider scheme="light"><AdminArea {...props} /></HugoProvider>;
}

function AdminArea({ route }: Props) {
  const { user, refreshUser, logout } = useAdminAuth();

  useEffect(() => {
    // Re-check role from the server every time this screen is opened
    refreshUser();
  }, [refreshUser]);

  // Routing Logic
  if (!user) {
    return <AdminLogin />;
  }

  if (user.role !== 'admin') {
    return (
      <View style={styles.centerScreen}>
        <Icon name="alert-circle-outline" size={32} color="#c00" />
        <Text style={styles.deniedText}>Tài khoản "{user.username}" không có quyền quản trị.</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutLink}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <AdminDashboard initialSection={route?.params?.section} />;
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedText: { color: '#fff', fontSize: 15, marginTop: 12, marginBottom: 20, textAlign: 'center' },
  logoutLink: { color: '#c00', fontWeight: '600', fontSize: 14 },
});
