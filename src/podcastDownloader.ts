import Parser from 'rss-parser';


export class PodcastDownloader {
	private parser: Parser;

	constructor() {
		this.parser = new Parser();
	}

	async downloadLatestEpisode(url: string): Promise<ArrayBuffer> {
		return fetch(url)
			.then(resp => resp.text())
			.then(xml => this.parser.parseString(xml))
			.then(feed => feed.items[0]?.enclosure?.url || '')
			.then(audioUrl => fetch(audioUrl))
			.then(resp => resp.arrayBuffer());
	}
}
