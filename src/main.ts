import { PodcastDownloader } from "./podcastDownloader";
import { Transcriber, CloudflareWhisperTranscriber } from "./transcriber";
import { AdvertDetector, OpenAIGPTAdvertDetector } from "./advertDetector";
import { AdvertStripper, FlyAdvertStripper } from "./advertStripper";
import { Exporter, R2Exporter } from "./exporter";



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
		const { audioBuffer, audioUrl } = await this.podcastDownloader.downloadLatestEpisode(this.podcastFeedUrl);
		console.log('Podcast downloaded: ', audioUrl);

		console.log('\nTranscribing podcast...');
		const transcription = await this.transcriber.transcribe(audioBuffer);
		console.log('Podcast transcribed: ', transcription);

		console.log(`\nTranscription: ${transcription.map(segment => `${segment.startSeconds.toFixed(2)} - ${segment.endSeconds.toFixed(2)}: ${segment.text}`).join('\n')}`);

		console.log('\nDetecting advert segments...');
		const advertSegments = await this.advertDetector.detectAdvertSegments(transcription);
		const advertSegmentsFormatted = advertSegments.map(segment => ({
			start: segment.startSeconds.toFixed(2),
			end: segment.endSeconds.toFixed(2)
		}));
		console.log('Advert segments detected: ', advertSegmentsFormatted);

		console.log('\nStripping adverts...');
		const strippedAudio = await this.advertStripper.stripAdverts(audioUrl, advertSegments);
		console.log('Adverts stripped');

		console.log('\nExporting results...');
		await this.exporter.export(strippedAudio);
		console.log('Export completed');
	}
}


export default {
	async fetch(req, env: Env): Promise<Response> {

		const processor = new PodcastProcessor(
			new PodcastDownloader(),
			new CloudflareWhisperTranscriber(env),
			new OpenAIGPTAdvertDetector(env.OPENAI_API_KEY),
			new FlyAdvertStripper(env.FLY_ENDPOINT, env.FLY_API_KEY),
			new R2Exporter(env),
			"https://rss.acast.com/ftnewsbriefing"
		);

		await processor.run();

		return new Response(`Success.`);
	},

	// async scheduled(event, env, ctx): Promise<void> {

	// 	console.log(`Scheduled event fired`);

	// 	const processor = new PodcastProcessor(
	// 	);

	// 	await processor.run();
	// },

} satisfies ExportedHandler<Env>;
  