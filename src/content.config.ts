import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

// Home page content (src/components/home). Each entry's Markdown body is its summary or text.
const notes = defineCollection({
    loader: glob({ base: './src/content/notes', pattern: '*.md' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        tags: z.array(z.string()).optional(),
        draft: z.boolean().default(false),
    }),
});

const research = defineCollection({
    loader: glob({ base: './src/content/research', pattern: '*.md' }),
    schema: z.object({
        order: z.number(),
        title: z.string(),
    }),
});

const experience = defineCollection({
    loader: glob({ base: './src/content/experience', pattern: '*.md' }),
    schema: z.object({
        order: z.number(),
        period: z.string(),
        title: z.string(),
        org: z.string(),
        place: z.string(),
        href: z.url(),
    }),
});

export const collections = { notes, research, experience };
