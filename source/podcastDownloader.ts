import Parser from 'rss-parser';
import { Readable, Writable } from 'stream';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import { FeedMetadata, EpisodeMetadata } from 'models';


ffmpeg.setFfmpegPath(ffmpegPath.path);


export interface PodcastDownloader {
	downloadLatestEpisode(url: string): Promise<{
		originalAudioBuffer: ArrayBuffer,
		compressedAudioBuffers: ArrayBuffer[],
		feedMetadata: FeedMetadata,
		episodeMetadata: EpisodeMetadata
	}>;
}

// TODO: this is a bit of a mess, and actually I dont think I need we need to convert to opus,
//       we can just split the original audio file into chunks

export class PodcastDownloaderOpus implements PodcastDownloader {
	private parser: Parser;

	constructor() {
		this.parser = new Parser();
	}

	async downloadLatestEpisode(url: string): Promise<{
		originalAudioBuffer: ArrayBuffer,
		compressedAudioBuffers: ArrayBuffer[],
		feedMetadata: FeedMetadata,
		episodeMetadata: EpisodeMetadata
	}> {
		const xml = await fetch(url).then(resp => resp.text());
		const feed = await this.parser.parseString(xml);
		const audioUrl = feed.items[0]?.enclosure?.url || '';

		if (!audioUrl) {
			throw new Error('No audio URL found in the latest episode.');
		}

		const res = await fetch(audioUrl);
		const inputBuffer = Buffer.from(await res.arrayBuffer());
		console.log(`Downloaded original audio, size: ${(inputBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);

		const compressedBuffer = await this.convertToOpus(inputBuffer);
		console.log(`Converted to Opus, size: ${(compressedBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);

		const chunkBuffers = await this.splitOpusBufferIntoChunks(compressedBuffer);
		console.log(`Split into ${chunkBuffers.length} chunks.`);


		const feedMetadata: FeedMetadata = { // throwing runtime errors here, but will validate at some point how i need to handle these
			title: feed.title!,
			description: feed.description!,
			link: feed.link!,
			language: feed.language!,
			category: feed.itunes!.category!,
			explicit: feed.itunes!.explicit!,
			imageUrl: feed.itunes!.image!,
			guid: crypto.createHash('sha1').update(url).digest('hex'), // || feed.podcast!.guid!
			author: feed.itunes!.author!
		}

		const episodeMetadata: EpisodeMetadata = {
			title: feed.items[0]!.title!,
			guid: feed.items[0]!.guid!,
			link: feed.items[0]!.link!,
			publishDate: feed.items[0]!.pubDate!,
			description: feed.items[0]!.description!,
			imageUrl: feed.items[0]!.itunes!.image!,
			explicit: feed.items[0]!.itunes!.explicit,
			transcript: feed.items[0]?.transcript || ''
		}

		return {
			originalAudioBuffer: inputBuffer.buffer,
			compressedAudioBuffers: chunkBuffers.map(buf => buf.buffer),
			feedMetadata,
			episodeMetadata
		};
	}

	private convertToOpus(inputBuffer: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];

			const writable = new Writable({
				write(chunk, _, callback) {
					chunks.push(chunk);
					callback();
				}
			});

			ffmpeg(Readable.from([inputBuffer]))
				.audioBitrate('8k')
				.audioChannels(1)
				.outputFormat('opus')
				.on('error', reject)
				.on('end', () => {
					resolve(Buffer.concat(chunks));
				})
				.pipe(writable, { end: true });
		});
	}

	private async splitOpusBufferIntoChunks(inputBuffer: Buffer, chunkDurationSeconds = 900): Promise<Buffer[]> {
		const inputPath = join(tmpdir(), `${randomUUID()}.opus`);
		const baseOutputPath = join(tmpdir(), `${randomUUID()}_chunk_%03d.opus`);

		await writeFile(inputPath, inputBuffer);

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.audioCodec('copy')
				.outputOptions([
					'-f segment',
					`-segment_time ${chunkDurationSeconds}`,
					'-reset_timestamps 1'
				])
				.output(baseOutputPath)
				.on('end', () => resolve())
				.on('error', reject)
				.run();
		});

		const buffers: Buffer[] = [];
		let index = 0;

		while (true) {
			const chunkPath = baseOutputPath.replace('%03d', index.toString().padStart(3, '0'));
			try {
				const chunk = await readFile(chunkPath);
				buffers.push(chunk);
				await unlink(chunkPath);
				index++;
			} catch {
				break;
			}
		}

		await unlink(inputPath);

		return buffers;
	}
}
