import { TimeRange } from './models';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

ffmpeg.setFfmpegPath(ffmpegPath.path);

export type StrippedResult = {
  podcast: ArrayBuffer;
  adverts: ArrayBuffer[];
};

export interface AdvertStripper {
  stripAdverts(
    arrayBuffer: ArrayBuffer,
    advertRanges: TimeRange[]
  ): Promise<StrippedResult>;
}

export class FfmpegAdvertStripper implements AdvertStripper {
  private outputQualityKbps: number;
  private audioChannels: number;
  private outputFormat: string;

  constructor(outputQualityKbps = 64, audioChannels = 2, outputFormat = 'opus') {
    this.outputQualityKbps = outputQualityKbps;
    this.audioChannels = audioChannels;
    this.outputFormat = outputFormat;
  }

  async stripAdverts(
    arrayBuffer: ArrayBuffer,
    advertRanges: TimeRange[]
  ): Promise<StrippedResult> {
    const tempInputPath = join(tmpdir(), `${randomUUID()}.mp3`);
    const outputPath = join(tmpdir(), `${randomUUID()}-output.${this.outputFormat}`);
    const advertPaths: string[] = [];

    try {
      await writeFile(tempInputPath, Buffer.from(arrayBuffer));

      const duration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
          if (err || !metadata.format?.duration) return reject(err);
          resolve(metadata.format.duration);
        });
      });

      const nonAdRanges: TimeRange[] = [];
      let lastEnd = 0;
      for (const ad of advertRanges.sort((a, b) => a.startSeconds - b.startSeconds)) {
        if (ad.startSeconds > lastEnd) {
          nonAdRanges.push({ startSeconds: lastEnd, endSeconds: ad.startSeconds });
        }
        lastEnd = Math.max(lastEnd, ad.endSeconds);
      }
      if (lastEnd < duration) {
        nonAdRanges.push({ startSeconds: lastEnd, endSeconds: duration });
      }

      const filters = nonAdRanges.map((range, i) => {
        return `[0:a]atrim=start=${range.startSeconds}:end=${range.endSeconds},asetpts=PTS-STARTPTS[a${i}]`;
      }).join('; ');
      const concatInputs = nonAdRanges.map((_, i) => `[a${i}]`).join('');
      const fullFilter = `${filters}; ${concatInputs}concat=n=${nonAdRanges.length}:v=0:a=1[out]`;

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempInputPath)
          .outputOptions('-filter_complex', fullFilter, '-map', '[out]')
          .audioBitrate(`${this.outputQualityKbps}k`)
          .audioChannels(this.audioChannels)
          .outputFormat(this.outputFormat)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(outputPath);
      });

      const processedBuffer = await readFile(outputPath);

      const adverts: ArrayBuffer[] = [];
      for (const [i, ad] of advertRanges.entries()) {
        const advertOutput = join(tmpdir(), `${randomUUID()}-ad-${i}.${this.outputFormat}`);
        advertPaths.push(advertOutput);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempInputPath)
            .setStartTime(ad.startSeconds)
            .setDuration(ad.endSeconds - ad.startSeconds)
            .audioBitrate(`${this.outputQualityKbps}k`)
            .audioChannels(this.audioChannels)
            .outputFormat(this.outputFormat)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .save(advertOutput);
        });

        const adBuffer = await readFile(advertOutput);
        adverts.push(adBuffer.buffer);
      }

      return {
        podcast: processedBuffer.buffer,
        adverts,
      };
    } finally {
      // Clean up temp files
      await Promise.allSettled([
        unlink(tempInputPath),
        unlink(outputPath),
        ...advertPaths.map(path => unlink(path)),
      ]);
    }
  }
}
