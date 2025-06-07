import { TextSegment, TextSegmentSchema } from "./models";
import { z } from 'zod';
import { Buffer } from 'node:buffer';



export interface Transcriber {
	transcribe(audio: ArrayBuffer): Promise<TextSegment[]>;
	transcribeMultiple(audioBuffers: ArrayBuffer[], audioBufferLengthMinutes?: number): Promise<TextSegment[]>;
}


export class CloudflareWhisperTranscriber implements Transcriber {

	constructor(private accountId: string, private apiToken: string) {}	

	async transcribe(audio: ArrayBuffer): Promise<TextSegment[]> {
		const api_url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/openai/whisper`;

		const response = await fetch(api_url, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.apiToken}`,
				"Content-Type": "application/octet-stream"
			},
			body: Buffer.from(audio)
		});

		if (!response.ok) {
			throw new Error(`Transcription request failed: ${response.statusText}`);
		}

		const resJson = await response.json();

		if (!resJson.success || !resJson.result?.words) {
			throw new Error("Transcription failed or no words found");
		}

		const segments: TextSegment[] = resJson.result.words.map((word: any) => ({
			startSeconds: word.start,
			endSeconds: word.end,
			text: word.word
		}));

		const transcription = z.array(TextSegmentSchema).parse(segments);

		if (transcription.length === 0) {
			throw new Error("No transcription segments found");
		}

		return transcription;
	}

	async transcribeMultiple(audioBuffers: ArrayBuffer[], audioBufferLengthMinutes: number = 15): Promise<TextSegment[]> {
		let allSegments: TextSegment[] = [];
		let offset = 0;

		for (const buffer of audioBuffers) {
			const segments = await this.transcribe(buffer);

			const adjustedSegments = segments.map(segment => ({
				startSeconds: segment.startSeconds + offset,
				endSeconds: segment.endSeconds + offset,
				text: segment.text
			}));

			allSegments.push(...adjustedSegments);

			offset += audioBufferLengthMinutes * 60;
		}

		return allSegments;
	}
}
