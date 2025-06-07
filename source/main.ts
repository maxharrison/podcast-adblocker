import { PodcastDownloader, PodcastDownloaderOpus } from "./podcastDownloader";
import { Transcriber, CloudflareWhisperTranscriber } from "./transcriber";
import { AdvertDetector, OpenAIGPTAdvertDetector } from "./advertDetector";
import { AdvertStripper, FfmpegAdvertStripper } from "./advertStripper";
import { Exporter, R2Exporter } from "./exporter";
import dotenv from 'dotenv';

dotenv.config();


export class PodcastProcessor {
	constructor(
		private podcastDownloader: PodcastDownloader,
		private transcriber: Transcriber,
		private advertDetector: AdvertDetector,
		private advertStripper: AdvertStripper,
		private exporter: Exporter,
		private podcastFeedUrl: string,
	) { }

	public async run(): Promise<void> {
		console.log('Downloading latest episode...');
		const {
			originalAudioBuffer,
			compressedAudioBuffers,
			feedMetadata,
			episodeMetadata
		} = await this.podcastDownloader.downloadLatestEpisode(this.podcastFeedUrl);
		console.log('Podcast downloaded');

		console.log('\nTranscribing podcast...');
		const transcription = await this.transcriber.transcribeMultiple(compressedAudioBuffers);
		console.log('Podcast transcribed: ', transcription.length, 'length');

		console.log('\nDetecting advert segments...');
		const advertSegments = await this.advertDetector.detectAdvertSegments(transcription);
		console.log('Advert segments detected: ', advertSegments);

		console.log('\nStripping adverts...');
		const strippedAudio = await this.advertStripper.stripAdverts(originalAudioBuffer, advertSegments);
		console.log('Adverts stripped');

		console.log('\nExporting results...');
		await this.exporter.export(
			strippedAudio,
			feedMetadata,
			episodeMetadata
		);
		console.log('Export completed');
	}
}


async function main(): Promise<Response> {

	const processor = new PodcastProcessor(
		new PodcastDownloaderOpus(),
		new CloudflareWhisperTranscriber(
			process.env.CLOUDFLARE_ACCOUNT_ID!,
			process.env.CLOUDFLARE_API_TOKEN!
		),
		new OpenAIGPTAdvertDetector(
			process.env.OPENAI_API_KEY!,
			process.env.OPENAI_BASE_URL!,
		),
		new FfmpegAdvertStripper(),
		new R2Exporter(
			process.env.S3_ENDPOINT!,
			process.env.S3_ACCESS_KEY_ID!,
			process.env.S3_SECRET_ACCESS_KEY!,
			process.env.S3_BUCKET_NAME!,
			process.env.S3_PUBLIC_URL!
		),
		process.env.PODCAST_URL!
	);

	await processor.run();
	return new Response(`Success`);
}


main()
