import { StrippedResult } from './advertStripper';


export interface Exporter {
	export(result: StrippedResult): Promise<void>;
}


export class R2Exporter implements Exporter {
    constructor(private env: Env) { }

    async export(result: StrippedResult): Promise<void> {
        const { podcast, adverts } = result;

        const uniqueId = Math.random().toString(36).substring(2, 15);
        await this.env.BUCKET.put(`podcast-${uniqueId}.mp3`, podcast, {
            httpMetadata: {
                contentType: 'audio/mpeg',
            },
        });

        // for (let i = 0; i < adverts.length; i++) {
        //     const advertKey = `advert-${i + 1}.mp3`;
        //     await this.env.BUCKET.put(advertKey, adverts[i], {
        //         httpMetadata: {
        //             contentType: 'audio/mpeg',
        //         },
        //     });
        // }
    }
}