import ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';
import { TimeRange } from './models';


export type StrippedResult = {
	podcast: ArrayBuffer;
	adverts: ArrayBuffer[];
};

export interface AdvertStripper {
	stripAdverts(
		audioBuffer: ArrayBuffer,
		advertRanges: TimeRange[]
	): Promise<StrippedResult>;
}

export class AdvertStripperV1 implements AdvertStripper {

	async stripAdverts(
		audioBuffer: ArrayBuffer,
		advertRanges: TimeRange[]
	): Promise<StrippedResult> {
		const ads = advertRanges
			.slice()
			.sort((a, b) => a.startSeconds - b.startSeconds);

		const keepFilters: string[] = [];
		let cursor = 0;
		for (const { startSeconds: start, endSeconds: end } of ads) {
			if (cursor < start) {
				keepFilters.push(
					`atrim=start=${cursor}:end=${start},asetpts=PTS-STARTPTS`
				);
			}
			cursor = end;
		}
		keepFilters.push(`atrim=start=${cursor},asetpts=PTS-STARTPTS`);

		const segLabels = keepFilters.map((_, i) => `[seg${i}]`);
		const filterComplex =
			keepFilters.length > 1
				? keepFilters
					.map((f, i) => `[0:a]${f}[seg${i}]`)
					.join(';') +
				';' +
				segLabels.join('') +
				`concat=n=${keepFilters.length}:v=0:a=1[out]`
				: `[0:a]${keepFilters[0]}[out]`;

		const cleanBuf = await this._runFfmpegBuffer(
			audioBuffer,
			['-filter_complex', filterComplex, '-map', '[out]']
		);

		const advertBufs = await Promise.all(
			ads.map(({ startSeconds: start, endSeconds: end }) =>
				this._runFfmpegBuffer(audioBuffer, [
					`-ss`,
					`${start}`,
					`-t`,
					`${end - start}`,
				])
			)
		);

		return {
			podcast: cleanBuf.buffer,
			adverts: advertBufs.map((b) => b.buffer),
		};
	}


	private _runFfmpegBuffer(
		audioBuffer: ArrayBuffer,
		outputOptions: string[]
	): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const inputStream = Readable.from(Buffer.from(audioBuffer));
			const outputStream = new PassThrough();
			const chunks: Buffer[] = [];

			outputStream.on('data', (chunk) => chunks.push(chunk));
			outputStream.on('end', () => resolve(Buffer.concat(chunks)));
			outputStream.on('error', reject);

			ffmpeg()
				.input(inputStream)
				.inputFormat('mp3')
				.outputOptions(outputOptions)
				.format('mp3')
				.on('error', reject)
				.pipe(outputStream, { end: true });
		});
	}
}
