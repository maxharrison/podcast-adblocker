import Parser from 'rss-parser';

export class PodcastDownloader {
	private parser: Parser;

	constructor() {
		this.parser = new Parser();
	}

	async downloadLatestEpisode(url: string): Promise<{ audioBuffer: ArrayBuffer, audioUrl: string }> {
		const xml = await fetch(url).then(resp => resp.text());
		const feed = await this.parser.parseString(xml);
		const audioUrl = feed.items[0]?.enclosure?.url || '';

		if (!audioUrl) {
			throw new Error('No audio URL found in the latest episode.');
		}

		const audioBuffer = await fetch(audioUrl).then(resp => resp.arrayBuffer());

		console.log(`Downloaded audio buffer length: ${audioBuffer.byteLength} bytes`);

		// megabyte size of the audio file
		const megabytes = audioBuffer.byteLength / (1024 * 1024);
		console.log(`Audio file size: ${megabytes.toFixed(2)} MB`);

		return { audioBuffer, audioUrl };
	}
}