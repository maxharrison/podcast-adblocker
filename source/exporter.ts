
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { StrippedResult } from './advertStripper';
import { FeedMetadata, EpisodeMetadata } from './models';
import { parseBuffer } from 'music-metadata';


export interface Exporter {
    export(
        result: StrippedResult,
        feedMetadata: FeedMetadata,
        episodeMetadata: EpisodeMetadata
    ): Promise<void>;
}


// TODO: actually add to the original feed, not replace it

export class R2Exporter implements Exporter {
    private s3: S3Client;
    private bucketName: string;
    private publicUrl: string;

    constructor(
        s3Endpoint: string,
        accessKeyId: string,
        secretAccessKey: string,
        bucketName: string,
        publicUrl: string
    ) {
        this.bucketName = bucketName;
        this.publicUrl = publicUrl;
        this.s3 = new S3Client({
            region: 'auto',
            endpoint: s3Endpoint,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            },
        });
    }

    async export(
        result: StrippedResult,
        feedMetadata: FeedMetadata,
        episodeMetadata: EpisodeMetadata
    ): Promise<void> {
        const { podcast, adverts } = result;

        const episodeFileName = `${feedMetadata.guid}/${episodeMetadata.guid}.mp3`;
        const episodeUrl = `${this.publicUrl}/${episodeFileName}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: episodeFileName,
            Body: Buffer.from(podcast),
            ContentType: 'audio/mpeg',
        }));

        for (let i = 0; i < adverts.length; i++) {
            const advertKey = `${feedMetadata.guid}/advert-${i + 1}-${episodeMetadata.guid}.mp3`;
            await this.s3.send(new PutObjectCommand({
                Bucket: this.bucketName,
                Key: advertKey,
                Body: Buffer.from(adverts[i]),
                ContentType: 'audio/mpeg',
            }));
        }
        
        const episodeDuration = Math.floor((await parseBuffer(Buffer.from(podcast), 'audio/mpeg')).format.duration ?? 0).toString();
        const episodeLengthBytes = podcast.byteLength;
        const episodeCodec = 'audio/mpeg';

        const rss = this.generateRssFeed(
            episodeUrl,
            episodeCodec,
            episodeLengthBytes,
            episodeDuration,
            `${this.publicUrl}/${feedMetadata.guid}/feed.xml`,
            feedMetadata,
            episodeMetadata
        );

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: `${feedMetadata.guid}/feed.xml`,
            Body: rss,
            ContentType: 'application/rss+xml',
        }));
    }

    
    private generateRssFeed(
        episodeUrl: string,
        episodeCodec: string = 'audio/mpeg',
        episodeLengthBytes: number,
        episodeDuration: string,
        feedLink: string,
        feedMetadata: FeedMetadata,
        episodeMetadata: EpisodeMetadata,
        feedLocked: string = 'true',
    ): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
        xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
        xmlns:atom="http://www.w3.org/2005/Atom"
        xmlns:podcast="https://podcastindex.org/namespace/1.0">
    <channel>
        <atom:link href="${feedLink}" rel="self" type="application/rss+xml" />
        <title>${feedMetadata.title} - Adblocked</title>
        <description><![CDATA[${feedMetadata.description}]]></description>
        <link>${feedMetadata.link}</link>
        <language>${feedMetadata.language}</language>
        <itunes:category text="${feedMetadata.category}" />
        <itunes:explicit>${feedMetadata.explicit}</itunes:explicit>
        <itunes:image href="${feedMetadata.imageUrl}" />
        <podcast:locked>${feedLocked}</podcast:locked>
        <podcast:guid>${feedMetadata.guid}-podcast-adblocker</podcast:guid>
        <itunes:author><![CDATA[${feedMetadata.author}]]></itunes:author>
        <item>
            <title>${episodeMetadata.title}</title>
            <enclosure length="${episodeLengthBytes}" type="${episodeCodec}" url="${episodeUrl}"/>
            <guid>${episodeMetadata.guid}-podcast-adblocker</guid>
            <link>${episodeMetadata.link}</link>
            <pubDate>${episodeMetadata.publishDate}</pubDate>
            <description>${episodeMetadata.description}</description>
            <itunes:duration>${episodeDuration}</itunes:duration>
            <itunes:image href="${episodeMetadata.imageUrl}" />
            <itunes:explicit>${episodeMetadata.explicit}</itunes:explicit>
            <podcast:transcript>${episodeMetadata.transcript}</podcast:transcript>
        </item>
    </channel>
</rss>`;
        }
}
