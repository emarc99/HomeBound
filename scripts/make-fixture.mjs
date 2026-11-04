// Writes camera EXIF (capture time + GPS) into a JPEG so the evidence checks can be exercised.
// Usage: node scripts/make-fixture.mjs <in.jpg> <out.jpg> <lat> <lng> "<YYYY:MM:DD HH:MM:SS>" [crop=left|right]
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import piexif from "piexifjs";

const [, , input, output, lat, lng, taken, crop] = process.argv;
if (!input || !output || !lat || !lng || !taken) {
  console.error('Usage: node scripts/make-fixture.mjs <in.jpg> <out.jpg> <lat> <lng> "<YYYY:MM:DD HH:MM:SS>" [crop=left|right]');
  process.exit(1);
}

const toDms = (deg) => {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
};

let img = sharp(readFileSync(input));
if (crop) {
  const { width, height } = await img.metadata();
  const w = Math.round(width * 0.6);
  img = img.extract({ left: crop === "right" ? width - w : 0, top: 0, width: w, height });
}
const jpeg = (await img.jpeg({ quality: 90 }).toBuffer()).toString("binary");

const exif = {
  "0th": { [piexif.ImageIFD.Make]: "TECNO", [piexif.ImageIFD.Model]: "CAMON 30" },
  Exif: { [piexif.ExifIFD.DateTimeOriginal]: taken },
  GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: Number(lat) >= 0 ? "N" : "S",
    [piexif.GPSIFD.GPSLatitude]: toDms(Number(lat)),
    [piexif.GPSIFD.GPSLongitudeRef]: Number(lng) >= 0 ? "E" : "W",
    [piexif.GPSIFD.GPSLongitude]: toDms(Number(lng)),
  },
};
writeFileSync(output, Buffer.from(piexif.insert(piexif.dump(exif), jpeg), "binary"));
console.log(`wrote ${output}`);
