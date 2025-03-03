import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
    // Load Markdown and MDX files in the `src/content/blog/` directory.
    // loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
    loader: async () => {
        const allFiles = await glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }) || [];
    
        return Array.isArray(allFiles) ? allFiles.filter(file => !file.includes('/disabled/')) : [];
    },

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

export const collections = { blog };