import OpenAI from "openai";
import { z } from "zod";
import { TextSegment, TimeRange, TextSegmentSchema, TimeRangeSchema } from './models';


export interface AdvertDetector {
	_serialiseTextSegments(textSegments: TextSegment[]): string;
	detectAdvertSegments(textSegments: TextSegment[]): Promise<TimeRange[]>;
}

export class OpenAIGPTAdvertDetector implements AdvertDetector {
	private openai: OpenAI;

	constructor(private apiKey: string, private model = "gpt-4.1-mini") {
		this.openai = new OpenAI({
			apiKey: this.apiKey,
		});
	};

	_serialiseTextSegments(textSegments: TextSegment[]): string {
		return textSegments
			.map(({ startSeconds, endSeconds, text }) => {
				const clean = text.trim();
				return `< [s=${startSeconds.toFixed(2)}] ${clean} [e=${endSeconds.toFixed(2)}] >`;
			})
			.join(" ");
	}

	async detectAdvertSegments(textSegments: TextSegment[]): Promise<TimeRange[]> {
		const systemPrompt =
			"You are a podcast advert segment detector. " +
			"You will be given a transcript of a podcast episode, and you need to identify the segments " +
			"where adverts are present. You will return an array of objects, each containing the start " +
			"and end time of the advert segment in seconds.";

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
				"format": {
					"type": "json_schema",
					"name": "TimeRangeList",
					"strict": true,
					"schema": {
						"type": "object",
						"properties": {
							"timeRanges": {
								"type": "array",
								"description": "A list of time ranges.",
								"items": {
									"type": "object",
									"properties": {
										"startSeconds": {
											"type": "number",
											"description": "The start time in seconds."
										},
										"endSeconds": {
											"type": "number",
											"description": "The end time in seconds."
										}
									},
									"required": [
										"startSeconds",
										"endSeconds"
									],
									"additionalProperties": false
								}
							}
						},
						"required": [
							"timeRanges"
						],
						"additionalProperties": false
					}
				}
			},
		});

		const result = z.object({
			timeRanges: z.array(TimeRangeSchema),
		}).safeParse(response.output_parsed);

		if (!result.success) {
			throw new Error(`Failed to parse advert segments: ${result.error.message}`);
		}
		
		return result.data.timeRanges
	}
}
