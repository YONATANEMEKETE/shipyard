import type { AvatarMime } from '@shipyard/shared';
import { avatarMimeAllowlist } from '@shipyard/shared';

/**
 * Route-local avatar multipart gates (api-design §5.1 #5, data-model D3).
 *
 * The multipart request has no JSON body schema — validation is a gate chain
 * over the parsed file part, in the documented order (each gate fails before
 * the next costs anything):
 *
 *   part present → claimed MIME ∈ allowlist → magic-byte sniff agrees
 *   → extension matches → bytes ≤ 2MB (enforced by multer limits pre-buffer)
 *
 * The size gate lives in `routes.ts` (multer `limits.fileSize`), which aborts
 * the stream at the cap — oversized floods never fully buffer, and the
 * MulterError is mapped to `400 VALIDATION_ERROR` with the field in details.
 */

// Magic-byte sniffing — the claimed Content-Type is client-asserted and never
// trusted alone (D3: "MIME sniffed, extension matched"). Hand-rolled: the
// three allowlisted formats have short, unambiguous signatures, and no image
// processing/decode dependency is wanted in the upload path.
export function sniffAvatarMime(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF (SOI + first marker)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: "RIFF" ???? "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

// Filename extensions accepted per MIME — jpeg admits both spellings on
// upload; the stored key always derives the canonical `jpg` (r2.ts ext map).
const EXTENSIONS_BY_MIME: Record<AvatarMime, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export function extensionMatches(mime: AvatarMime, filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext !== undefined && EXTENSIONS_BY_MIME[mime].includes(ext);
}

export function isAllowedAvatarMime(value: string): value is AvatarMime {
  return (avatarMimeAllowlist as readonly string[]).includes(value);
}
