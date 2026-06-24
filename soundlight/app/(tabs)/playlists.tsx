import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Playlist } from '../../src/types';
import { getAllPlaylists, createPlaylist, deletePlaylist } from '../../src/db/db';

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const router = useRouter();

  const load = useCallback(async () => {
    const all = await getAllPlaylists();
    setPlaylists(all);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    if (!newName.trim()) return;
    await createPlaylist(newName.trim());
    setNewName('');
    setShowCreate(false);
    await load();
  }

  async function handleDelete(playlist: Playlist) {
    Alert.alert(
      'Delete playlist',
      `Remove "${playlist.name}"? This won't delete any music.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePlaylist(playlist.id);
            await load();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1DB954" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Playlists</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setShowCreate(true)}
        >
          <Ionicons name="add" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {playlists.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={48} color="#444" />
          <Text style={styles.emptyTitle}>No playlists yet</Text>
          <Text style={styles.emptyText}>Tap + to create your first playlist.</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/playlist/${item.id}`)}
              onLongPress={() => handleDelete(item)}
            >
              <View style={styles.playlistIcon}>
                <Ionicons name="musical-notes" size={20} color="#1DB954" />
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>New playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor="#666"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowCreate(false); setNewName(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreate, !newName.trim() && styles.modalCreateDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim()}
              >
                <Text style={styles.modalCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  heading: { color: '#fff', fontSize: 28, fontWeight: '700' },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  playlistIcon: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#1a3322',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '500' },
  desc: { color: '#888', fontSize: 13, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 20,
    width: '80%',
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 8 },
  modalCancelText: { color: '#888', fontSize: 15 },
  modalCreate: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCreateDisabled: { opacity: 0.4 },
  modalCreateText: { color: '#000', fontWeight: '600', fontSize: 15 },
});