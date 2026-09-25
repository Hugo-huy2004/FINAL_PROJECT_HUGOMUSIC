import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAdminAuth } from './hooks/useAdminAuth';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './AdminDashboard';

// Reachable only by navigating directly to /admin (see linking config in
// src/navigation/AppNavigator.tsx) — there is no link to it anywhere in the app's UI.
export default function AdminScreen() {
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
        <Ionicons name="alert-circle-outline" size={32} color="#c00" />
        <Text style={styles.deniedText}>Tài khoản "{user.username}" không có quyền quản trị.</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutLink}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <AdminDashboard />;
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedText: { color: '#fff', fontSize: 15, marginTop: 12, marginBottom: 20, textAlign: 'center' },
  logoutLink: { color: '#c00', fontWeight: '600', fontSize: 14 },
});
