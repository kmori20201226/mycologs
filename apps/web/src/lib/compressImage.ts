// Downscale + re-encode an image in the browser before upload, to cut bytes on
// slow connections. Falls back to the original file on any failure (unsupported
// format like HEIC, decode error, missing canvas API) so an upload is never
// blocked by compression.
//
// EXIF orientation is baked into the pixels (imageOrientation: 'from-image'),
// so re-encoded photos display the right way up even though we drop EXIF.

const DEFAULT_MAX_EDGE = 2048
const DEFAULT_QUALITY = 0.85

// Only these re-encode cleanly to JPEG. Others (gif/animated, heic, svg) pass
// through untouched.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function compressImage(
    file: File,
    opts: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
    const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE
    const quality = opts.quality ?? DEFAULT_QUALITY

    if (!COMPRESSIBLE.has(file.type)) return file
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const { width, height } = bitmap
        const scale = Math.min(1, maxEdge / Math.max(width, height))
        const targetW = Math.round(width * scale)
        const targetH = Math.round(height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) { bitmap.close?.(); return file }
        // White matte so PNG transparency doesn't turn black in JPEG.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, targetW, targetH)
        ctx.drawImage(bitmap, 0, 0, targetW, targetH)
        bitmap.close?.()

        const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', quality),
        )
        if (!blob) return file
        // If the "compressed" result isn't actually smaller (already tiny image),
        // keep the original to avoid needless quality loss.
        if (blob.size >= file.size) return file

        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
        return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
    } catch {
        return file
    }
}
