import { z } from 'zod';

export const TimeRangeSchema = z.object({
  startSeconds: z.number(),
  endSeconds:   z.number(),
});


export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const TextSegmentSchema = TimeRangeSchema.extend({
  text: z.string(),
});

export type TextSegment = z.infer<typeof TextSegmentSchema>;

export type FeedMetadata = {
    title: string;
    description: string;
    link: string;
    language: string;
    category: string;
    explicit: string;
    imageUrl: string;
    guid: string;
    author: string;
};

export type EpisodeMetadata = {
    title: string;
    guid: string;
    link: string;
    publishDate: string;
    description: string;
    imageUrl: string;
    explicit: string;
    transcript: string;
};