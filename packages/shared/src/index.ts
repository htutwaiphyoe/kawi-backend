import { z } from 'zod';

export const PlaceholderSchema = z.object({ ok: z.boolean() });
export type Placeholder = z.infer<typeof PlaceholderSchema>;
