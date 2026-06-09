import exifr from 'exifr'

export interface ExifInfo {
  latitude: number | null
  longitude: number | null
  takenAt: string | null // ISO 8601, from the photo's EXIF capture time
}

const EMPTY: ExifInfo = { latitude: null, longitude: null, takenAt: null }

// Read GPS coordinates and capture time from an image file's EXIF, in the
// browser. Returns nulls for any piece the photo doesn't carry (many photos
// have GPS stripped or were never geotagged). Never throws — a corrupt or
// non-image file just yields empty info.
export async function readExif(file: File): Promise<ExifInfo> {
  if (!file.type.startsWith('image/')) return EMPTY

  const info: ExifInfo = { ...EMPTY }

  try {
    const gps = await exifr.gps(file)
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      info.latitude = gps.latitude
      info.longitude = gps.longitude
    }
  } catch {
    /* no/invalid GPS — leave null */
  }

  try {
    const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const taken: unknown = meta?.DateTimeOriginal ?? meta?.CreateDate
    if (taken instanceof Date && !Number.isNaN(taken.getTime())) {
      info.takenAt = taken.toISOString()
    }
  } catch {
    /* no/invalid timestamp — leave null */
  }

  return info
}
