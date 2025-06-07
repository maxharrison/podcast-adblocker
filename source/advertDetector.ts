import OpenAI from "openai";
import { z } from "zod";
import { TextSegment } from './models';


export const AdvertSegmentSchema = z.object({
  startSeconds: z.number(),
  endSeconds: z.number(),
  description: z.string(),
});

export type AdvertSegment = z.infer<typeof AdvertSegmentSchema>;


export interface AdvertDetector {
	_serialiseTextSegments(textSegments: TextSegment[]): string;
	detectAdvertSegments(textSegments: TextSegment[]): Promise<AdvertSegment[]>;
}

export class OpenAIGPTAdvertDetector implements AdvertDetector {
	private openai: OpenAI;

	constructor(private apiKey: string, private baseURL: string, private model = "gpt-4.1-mini") {
		this.openai = new OpenAI({
			apiKey: this.apiKey,
			baseURL: this.baseURL,
		});
	};

	_serialiseTextSegments(textSegments: TextSegment[]): string {
		return textSegments
			.map(({ startSeconds, endSeconds, text }) => {
				const clean = text.trim();
				return `<[s=${startSeconds.toFixed(2)}] ${clean} [e=${endSeconds.toFixed(2)}]>`;
			})
			.join(" ");
	}

	async detectAdvertSegments(textSegments: TextSegment[]): Promise<AdvertSegment[]> {
		const systemPrompt = `
		You are an expert podcast advert segment detector.
		
		Your task is to identify segments in the transcript that are advertisements or promotional content. These are sections of audio that:
		- Promote sponsors, products, services, or the podcast itself.
		- Are **not integral to the main content** or discussion.
		- Could be removed without harming the listener's understanding of the core episode.
		
		Return a list of start and end times (in seconds) for each advert segment, along with a short plain-text description (1–2 sentences) of what the advert is promoting.
		
		Do **not** include content-related discussions or native ads that are tightly integrated into the episode’s subject matter.
		
		### Example Input Transcript (formatted as serialized segments):
		
		<[s=12.00] Welcome to the show! [e=15.00]> <[s=15.01] This episode is sponsored by Acme Corp – makers of smart socks. [e=22.50]> <[s=22.51] Now let’s dive into the interview with Dr. Jane Smith about climate change. [e=30.00]>
		
		### Expected Output:
		{
		  "advertSegments": [
			{
			  "startSeconds": 15.01,
			  "endSeconds": 22.50,
			  "description": "Promotional message for Acme Corp's smart socks."
			}
		  ]
		}
		
		Make sure the resulting podcast audio **still makes logical sense and flows naturally** after removing these segments.
		
		Return your output in strict JSON format following this schema:
		
		{
		  "advertSegments": [
			{
			  "startSeconds": number,
			  "endSeconds": number,
			  "description": string
			},
			...
		  ]
		}
		`.trim();		
		
		const serialisedTextSegments = this._serialiseTextSegments(textSegments);

		const response = await this.openai.responses.parse({
			model: this.model,
			input: [
				{
					"role": "system",
					"content": [
						{
							"type": "input_text",
							"text": systemPrompt
						}
					]
				},
				{
					"role": "user",
					"content": [
						{
							"type": "input_text",
							"text": serialisedTextSegments
						}
					]
				}
			],
			text: {
				format: {
					type: "json_schema",
					name: "AdvertSegmentList",
					strict: true,
					schema: {
						type: "object",
						properties: {
							advertSegments: {
								type: "array",
								description: "A list of time ranges with descriptions.",
								items: {
									type: "object",
									properties: {
										startSeconds: {
											type: "number",
											description: "The start time in seconds."
										},
										endSeconds: {
											type: "number",
											description: "The end time in seconds."
										},
										description: {
											type: "string",
											description: "A short description of what the advert is promoting."
										}
									},
									required: ["startSeconds", "endSeconds", "description"],
									additionalProperties: false
								}
							}
						},
						required: ["advertSegments"],
						additionalProperties: false
					}
				}
			}			  
		});

		const result = z.object({
			advertSegments: z.array(AdvertSegmentSchema),
		}).safeParse(response.output_parsed);

		if (!result.success) {
			throw new Error(`Failed to parse advert segments: ${result.error.message}`);
		}

		const advertSegments = result.data.advertSegments;

		if (advertSegments.length === 0) {
			throw new Error("No advert segments detected");
		}
		
		return advertSegments;
	}
}
