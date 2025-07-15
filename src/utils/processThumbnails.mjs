// src/utils/processThumbnails.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import rawVideosData from '../data/videos.json' with { type: 'json' };
import { url } from './site.js';

function slugify(text) {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
}

const videosData = rawVideosData;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '../../');
const publicDir = path.join(projectRoot, 'public');

const OPTIMIZED_IMAGES_SUBDIR = 'picture';
const optimizedThumbnailsDir = path.join(publicDir, OPTIMIZED_IMAGES_SUBDIR);

const OUTPUT_TS_PATH = path.resolve(__dirname, '../data/allVideos.ts');

const YOUR_DOMAIN = url;
if (!YOUR_DOMAIN) {
    console.error("Error: PUBLIC_SITE_URL is not defined in environment variables. Please check your .env file and ensure it's loaded.");
    process.exit(1);
}

const PLACEHOLDER_THUMBNAIL_PATH = `${YOUR_DOMAIN}/placeholder.webp`;
const DEFAULT_FALLBACK_WIDTH = 300;
const DEFAULT_FALLBACK_HEIGHT = 168;
const OPTIMIZED_THUMBNAIL_WIDTH = 300;

async function processThumbnails() {
    await fs.mkdir(optimizedThumbnailsDir, { recursive: true });

    // --- Perubahan: Pastikan direktori output TS juga ada ---
    const outputTsDir = path.dirname(OUTPUT_TS_PATH);
    await fs.mkdir(outputTsDir, { recursive: true });
    // --- AKHIR Perubahan ---

    const processedVideos = [];

    for (const video of videosData) {
        const videoSlug = slugify(video.title || 'untitled-video');
        const thumbnailFileName = `${videoSlug}-${video.id}.webp`;

        const outputPath = path.join(optimizedThumbnailsDir, thumbnailFileName);
        const relativeThumbnailPath = `${YOUR_DOMAIN}/${OPTIMIZED_IMAGES_SUBDIR}/${thumbnailFileName}`;

        try {
            if (video.thumbnail) {
                let inputBuffer;

                if (video.thumbnail.startsWith('http')) {
                    const response = await fetch(video.thumbnail);
                    if (!response.ok) {
                        throw new Error(`Failed to download thumbnail: ${response.statusText}`);
                    }
                    inputBuffer = Buffer.from(await response.arrayBuffer());
                }
                else {
                    const localInputPath = path.join(publicDir, video.thumbnail);
                    try {
                        await fs.access(localInputPath);
                        inputBuffer = await fs.readFile(localInputPath);
                        // console.log(`Using local thumbnail for ${video.title}: ${localInputPath}`); // Dihapus
                    } catch (localFileError) {
                        console.error(`[ERROR] Local thumbnail file not found for ${video.title}: ${localFileError.message}`);
                        throw new Error(`Local thumbnail not found or accessible: ${localFileError.message}`);
                    }
                }

                const optimizedBuffer = await sharp(inputBuffer)
                    .resize({ width: OPTIMIZED_THUMBNAIL_WIDTH, withoutEnlargement: true })
                    .webp({ quality: 70 })
                    .toBuffer();

                const optimizedMetadata = await sharp(optimizedBuffer).metadata();
                const finalWidth = optimizedMetadata.width || DEFAULT_FALLBACK_WIDTH;
                const finalHeight = optimizedMetadata.height || DEFAULT_FALLBACK_HEIGHT;

                await fs.writeFile(outputPath, optimizedBuffer);

                processedVideos.push({
                    ...video,
                    thumbnail: relativeThumbnailPath,
                    thumbnailWidth: finalWidth,
                    thumbnailHeight: finalHeight,
                });

            } else {
                console.warn(`No thumbnail URL found for video: ${video.title}. Using placeholder.`);
                processedVideos.push({
                    ...video,
                    thumbnail: PLACEHOLDER_THUMBNAIL_PATH,
                    thumbnailWidth: DEFAULT_FALLBACK_WIDTH,
                    thumbnailHeight: DEFAULT_FALLBACK_HEIGHT,
                });
            }
        } catch (error) {
            console.error(`Error processing thumbnail for video ${video.id} (${video.title}):`, error.message);
            processedVideos.push({
                ...video,
                thumbnail: PLACEHOLDER_THUMBNAIL_PATH,
                thumbnailWidth: DEFAULT_FALLBACK_WIDTH,
                thumbnailHeight: DEFAULT_FALLBACK_HEIGHT,
            });
        }
    }

    const outputContent = `import type { VideoData } from '../utils/data';\n\nconst allVideos: VideoData[] = ${JSON.stringify(processedVideos, null, 2)};\n\nexport default allVideos;\n`;
    await fs.writeFile(OUTPUT_TS_PATH, outputContent, 'utf-8');
}

processThumbnails().catch(console.error);
