import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Track } from '../../src/types';
import { getAllTracks } from '../../src/db/db';
import { pickAndImportFiles } from '../../src/lib/import';
import { TrackRow } from '../../components/TrackRow';
import { PlayerBar } from '../../components/PlayerBar';
import { usePlayer } from '../../src/audio/usePlayer';
import * as Player from '../../src/audio/player';

export default function LibraryScreen() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const { tracks: queueTracks, currentIndex } = usePlayer();

  const currentTrackId = currentIndex >= 0 ? queueTracks[currentIndex]?.id : null;

  const loadTracks = useCallback(async () => {
    const all = await getAllTracks();
    setTracks(all);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks])
  );

  async function handleImport() {
    setImporting(true);
    try {
      const result = await pickAndImportFiles();
      if (result.imported > 0) {
        await loadTracks();
        Alert.alert(
          'Import complete',
          `Added ${result.imported} track${result.imported !== 1 ? 's' : ''}.${
            result.skipped > 0 ? ` ${result.skipped} already in library.` : ''
          }`
        );
      }
      if (result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }
    } finally {
      setImporting(false);
    }
  }

  function handlePlay(track: Track, index: number) {
    Player.playQueue(tracks, index);
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
        <Text style={styles.heading}>Library</Text>
        <TouchableOpacity
          style={styles.importBtn}
          onPress={handleImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons name="add" size={20} color="#000" />
          )}
          <Text style={styles.importText}>{importing ? 'Importing…' : 'Add music'}</Text>
        </TouchableOpacity>
      </View>

      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={48} color="#444" />
          <Text style={styles.emptyTitle}>No music yet</Text>
          <Text style={styles.emptyText}>
            Tap "Add music" to import files from your device.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              isPlaying={item.id === currentTrackId}
              onPress={() => handlePlay(item, index)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}

      <PlayerBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  center: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  heading: {
    color: '#fff', // yo
    fontSize: 28,
    fontWeight: '700',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  importText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  list: {
    paddingBottom: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});