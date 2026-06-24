import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { usePlayer } from '../src/audio/usePlayer';
import * as Player from '../src/audio/player';

export function PlayerBar() {
  const { tracks, currentIndex, playerState, positionMs, durationMs } = usePlayer();

  const track = currentIndex >= 0 ? tracks[currentIndex] : null;
  if (!track) return null;

  const isPlaying = playerState === 'playing';
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <View style={styles.container}>
      {/* Seek bar */}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={progress}
        onSlidingComplete={(v) => Player.seekTo(v * durationMs)}
        minimumTrackTintColor="#1DB954"
        maximumTrackTintColor="#333"
        thumbTintColor="#1DB954"
      />

      <View style={styles.body}>
        {/* Cover */}
        <View style={styles.artwork}>
          {track.cover_path ? (
            <Image source={{ uri: track.cover_path }} style={styles.cover} />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="musical-note" size={16} color="#666" />
            </View>
          )}
        </View>

        {/* Track info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable onPress={Player.previous} style={styles.btn}>
            <Ionicons name="play-skip-back" size={22} color="#fff" />
          </Pressable>

          <Pressable onPress={Player.togglePlayPause} style={styles.btnMain}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={26}
              color="#000"
            />
          </Pressable>

          <Pressable onPress={Player.next} style={styles.btn}>
            <Ionicons name="play-skip-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#181818',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    paddingBottom: 24,
  },
  slider: {
    width: '100%',
    height: 20,
    marginTop: -4,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  artwork: {
    marginRight: 10,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  coverPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  artist: {
    color: '#888',
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    padding: 6,
  },
  btnMain: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
});