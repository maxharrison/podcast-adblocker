import * as fs from 'fs/promises';
import { StrippedResult } from './advertStripper';

export interface Exporter {
	export(result: StrippedResult): Promise<void>;
}

export class FileExporter implements Exporter {
	async export(result: StrippedResult): Promise<void> {
		await fs.writeFile('output/output.mp3', Buffer.from(result.podcast));
		console.log(`Clean audio saved to output.mp3`);
		for (let i = 0; i < result.adverts.length; i++) {
			await fs.writeFile(`output/advert_${i}.mp3`, Buffer.from(result.adverts[i]));
			console.log(`Advert ${i} saved to advert_${i}.mp3`);
		}
	}
}
