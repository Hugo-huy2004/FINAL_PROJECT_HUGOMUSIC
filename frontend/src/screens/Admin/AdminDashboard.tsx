import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAdminAuth } from './hooks/useAdminAuth';
import { useSongManager } from './hooks/useSongManager';
import DashboardStats from './components/DashboardStats';
import UploadForm from './components/UploadForm';
import { SongListItem } from './components/SongListItem';

export default function AdminDashboard() {
  const { user, logout } = useAdminAuth();
  const {
    status, setStatus, songs, counts, isUploading, handleUpload, handleUpdate, handleReview, handleDelete,
  } = useSongManager();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Dashboard Quản Trị</Text>
          <Text style={styles.welcomeText}>Xin chào, {user?.username}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      <UploadForm isUploading={isUploading} onUpload={handleUpload} />

      <DashboardStats status={status} counts={counts} onSelect={setStatus} />

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>
          {status === 'published' ? `Mới nhất (${songs.length})` : `${songs.length} bài`}
        </Text>
      </View>
      
      {songs.map((song) => (
        <SongListItem
          key={song._id}
          song={song}
          onUpdate={handleUpdate}
          onReview={handleReview}
          onDelete={handleDelete}
        />
      ))}
      
      {songs.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Không có bài nào ở mục này.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  content: { padding: 32, maxWidth: 900, width: '100%', alignSelf: 'center' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 32 
  },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#000', marginBottom: 4 },
  welcomeText: { fontSize: 14, color: '#666' },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 20,
  },
  logoutText: { color: '#FF3B30', fontWeight: '600', fontSize: 14 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
  }
});
