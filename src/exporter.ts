import * as fs from 'fs/promises';
import { StrippedResult } from './advertStripper';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';


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

export class S3Exporter implements Exporter {
    private s3Client: S3Client;
    private bucketName: string;

    constructor(bucketName: string) {
        this.s3Client = new S3Client({}); // Assumes Lambda execution role has permissions
        this.bucketName = bucketName;

        if (!bucketName) {
            throw new Error("S3_BUCKET_NAME environment variable not set.");
        }
    }

    async export(result: StrippedResult): Promise<void> {
        const podcastKey = 'output/output.mp3';
        await this.uploadToS3(podcastKey, Buffer.from(result.podcast));
        console.log(`Clean audio saved to s3://${this.bucketName}/${podcastKey}`);

        for (let i = 0; i < result.adverts.length; i++) {
            const advertKey = `output/advert_${i}.mp3`;
            await this.uploadToS3(advertKey, Buffer.from(result.adverts[i]));
            console.log(`Advert ${i} saved to s3://${this.bucketName}/${advertKey}`);
        }
    }

    private async uploadToS3(key: string, body: Buffer): Promise<void> {
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: body,
            ContentType: 'audio/mpeg', // Assuming MP3 format
        });

        try {
            await this.s3Client.send(command);
        } catch (error) {
            console.error(`Error uploading ${key} to S3:`, error);
            throw error; // Re-throw to indicate failure
        }
    }
}