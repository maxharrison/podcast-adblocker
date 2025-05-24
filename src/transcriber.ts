import { TextSegment, TextSegmentSchema } from './models';
import { z } from 'zod';


export interface Transcriber {
	transcribe(audio: ArrayBuffer): Promise<TextSegment[]>;
}

export class OpenAIWhisperTranscriber implements Transcriber {
	constructor(private apiKey: string, private model = 'whisper-1') { }

	async transcribe(audio: ArrayBuffer): Promise<TextSegment[]> {
		const file = new File([audio], 'audio.mp3', { type: 'audio/mpeg' });
		const form = new FormData();
		form.append('file', file);
		form.append('model', this.model);
		form.append('response_format', 'verbose_json');

		const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: { 'Authorization': `Bearer ${this.apiKey}` },
			body: form
		});

		const json = await response.json();

		const whisperResponseSchema = z.object({
			segments: z.array(z.object({
				text: z.string(),
				start: z.number(),
				end: z.number()
			}))
		});

		const parsed = whisperResponseSchema.parse(json);

		return parsed.segments.map(segment => 
			TextSegmentSchema.parse({
				text: segment.text,
				startSeconds: segment.start,
				endSeconds: segment.end
			})
		);
	}
}
