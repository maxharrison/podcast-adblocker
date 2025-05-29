import { TextSegment, TextSegmentSchema } from "./models";
import { z } from 'zod';
import { Buffer } from 'node:buffer';



export interface Transcriber {
	transcribe(audio: ArrayBuffer): Promise<TextSegment[]>;
}

export class CloudflareWhisperTranscriber implements Transcriber {
	constructor(private env: Env) {}

	async transcribe(audio: ArrayBuffer): Promise<TextSegment[]> {
		const base64 = Buffer.from(audio, 'binary').toString("base64");
		const res = await this.env.AI.run("@cf/openai/whisper-large-v3-turbo", {
			"audio": base64
		});

		if (!res || !res.segments || !Array.isArray(res.segments)) {
			throw new Error("Invalid response from Whisper API");
		}

		const segments: TextSegment[] = res.segments.flatMap((segment: any) =>
			segment.words.map((word: any) => ({
				startSeconds: word.start,
				endSeconds: word.end,
				text: word.word
			}))
		);

		const transcription = z.array(TextSegmentSchema).parse(segments);

		if (transcription.length === 0) {
			throw new Error("No transcription segments found");
		}

		return transcription;
	}
}

