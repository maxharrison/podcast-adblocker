import dotenv from 'dotenv';
import { PodcastDownloader } from './podcastDownloader';
import { Transcriber, OpenAIWhisperTranscriber } from './transcriber';
import { AdvertDetector, OpenAIGPTAdvertDetector } from './advertDetector';
import { AdvertStripper, AdvertStripperV1 } from './advertStripper';
import { Exporter, FileExporter } from './exporter';


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
		const audioBuffer = await this.podcastDownloader.downloadLatestEpisode(this.podcastFeedUrl);
		console.log('Podcast downloaded');

		console.log('\nTranscribing podcast...');
		const transcription = await this.transcriber.transcribe(audioBuffer);
		console.log('Podcast transcribed');

		console.log('\nDetecting advert segments...');
		const advertSegments = await this.advertDetector.detectAdvertSegments(transcription);
		console.log('Advert segments detected');

		console.log('\nStripping adverts...');
		const strippedAudio = await this.advertStripper.stripAdverts(audioBuffer, advertSegments);
		console.log('Adverts stripped');

		console.log('\nExporting results...');
		await this.exporter.export(strippedAudio);
		console.log('Export completed');
	}
}

async function main() {
	const processor = new PodcastProcessor(
		new PodcastDownloader(),
		new OpenAIWhisperTranscriber(process.env.OPENAI_API_KEY!),
		new OpenAIGPTAdvertDetector(process.env.OPENAI_API_KEY!),
		new AdvertStripperV1(),
		new FileExporter(),
		process.env.PODCAST_FEED_URL!
	);

	await processor.run();
}

main();