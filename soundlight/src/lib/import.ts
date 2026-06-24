import * as DocumentPicker from 'expo-document-picker';
import { insertTrack } from '../db/db';
import { Track } from '../types';

const AUDIO_MIME_TYPES = [
  'audio/mpeg',       
  'audio/flac',       
  'audio/x-flac',
  'audio/aac',       
  'audio/mp4',        
  'audio/ogg',        
  'audio/opus',      
  'audio/wav',       
  'audio/x-wav',
  'audio/webm',
  'audio/*',
];

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function pickAndImportFiles(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: AUDIO_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  return importFiles(result.assets);
}

export async function importFiles(assets: DocumentPicker.DocumentPickerAsset[]): Promise<ImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const asset of assets) {
    try {
      const meta = parseMetadataFromFilename(asset.name, asset.uri);

      const id = await insertTrack({
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: 0,
        bitrate: null,
        file_path: asset.uri,
        cover_path: null,
        date_added: Date.now(),
        hash: null,
      });

      if (id > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push(`${asset.name}: ${String(err)}`);
    }
  }

  return { imported, skipped, errors };
}

/*
 * Best-effort metadata from filename
 * Real metadata reading (ID3/Vorbis tags) requires a native module
 * this is the fallback that works without one
*/
function parseMetadataFromFilename(
  filename: string,
  _uri: string
): { title: string; artist: string; album: string } {
  const withoutExt = filename.replace(/\.[^.]+$/, '').trim();
  const parts = withoutExt.split(' - ').map((p) => p.trim());

  if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
    parts.shift();
  }

  if (parts.length >= 2) {
    return {
      artist: parts[0],
      title: parts.slice(1).join(' - '),
      album: 'Unknown Album',
    };
  }

  return {
    title: withoutExt || 'Unknown Title',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
  };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}