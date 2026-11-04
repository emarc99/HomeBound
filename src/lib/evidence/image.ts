import "server-only";
import { createHash } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import exifr from "exifr";

export type PhotoMeta = {
  sha256: string;
  dhash: string;
  takenAt: Date | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  width: number;
  height: number;
};

export class UnsupportedImageError extends Error {}

/** 64-bit difference hash: robust to resizing and recompression, so re-sent copies of a photo still match. */
async function dHash(input: Buffer): Promise<string> {
  const px = await sharp(input).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let y = 0; y < 8; y++) {
    for (let half = 0; half < 2; half++) {
      let nibble = 0;
      for (let x = half * 4; x < half * 4 + 4; x++) nibble = (nibble << 1) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0);
      hex += nibble.toString(16);
    }
  }
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

async function readExif(input: Buffer) {
  try {
    const tags = await exifr.parse(input, {
      gps: true,
      pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
    });
    if (!tags) return { takenAt: null, lat: null, lng: null, camera: null };
    const taken = tags.DateTimeOriginal ?? tags.CreateDate;
    const lat = typeof tags.latitude === "number" && Number.isFinite(tags.latitude) ? tags.latitude : null;
    const lng = typeof tags.longitude === "number" && Number.isFinite(tags.longitude) ? tags.longitude : null;
    const camera = [tags.Make, tags.Model].filter(Boolean).join(" ") || null;
    return { takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken : null, lat, lng, camera };
  } catch {
    return { takenAt: null, lat: null, lng: null, camera: null };
  }
}

/** Returns metadata from the original upload plus a resized JPEG with all metadata stripped for storage and the AI model. */
export async function processPhoto(input: Buffer): Promise<{ meta: PhotoMeta; jpeg: Buffer }> {
  let jpeg: Buffer;
  let info: OutputInfo;
  try {
    ({ data: jpeg, info } = await sharp(input)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new UnsupportedImageError("That file isn't an image we can read. Send a JPEG or PNG photo.");
  }
  const [exif, hash] = await Promise.all([readExif(input), dHash(input)]);
  return {
    jpeg,
    meta: {
      sha256: createHash("sha256").update(input).digest("hex"),
      dhash: hash,
      ...exif,
      width: info.width,
      height: info.height,
    },
  };
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
