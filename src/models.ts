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
