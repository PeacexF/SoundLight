import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../../src/types';
import { searchTracks } from '../../src/db/db';
import { TrackRow } from '../../components/TrackRow';
import { PlayerBar } from '../../components/PlayerBar';
import { usePlayer } from '../../src/audio/usePlayer';
import * as Player from '../../src/audio/player';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { tracks: queueTracks, currentIndex } = usePlayer();

  const currentTrackId = currentIndex >= 0 ? queueTracks[currentIndex]?.id : null;

  const runSearch = useCallback(async (q: string) => {
    const found = await searchTracks(q);
    setResults(found);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  function handlePlay(track: Track, index: number) {
    Player.playQueue(results, index);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Tracks, artists, albums…"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {results.length === 0 && query.length > 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No results for "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              isPlaying={item.id === currentTrackId}
              onPress={() => handlePlay(item, index)}
            />
          )}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    height: '100%',
  },
  list: {
    paddingBottom: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 15,
  },
});