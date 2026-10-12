import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
    // Load Markdown and MDX files in the `src/content/blog/` directory.
    loader: glob({
        base: './src/content/blog',
        pattern: ['**/*.{md,mdx}', '!**/disabled/**'],
    }),

    // Type-check frontmatter using a schema
    schema: z.object({
        icon: z.string(),
        title: z.string(),
        description: z.string(),
        // Transform string to Date object
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        heroImage: z.string().optional(),
        tags: z.array(z.string()).optional(),
    }),
});

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
        keywords: z.array(z.string()),
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

export const collections = { blog, notes, research, experience };
