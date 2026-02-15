import type { JobDefinition } from '../src/types';

interface ProcessImageData {
  imageUrl: string;
  operations: Array<'resize' | 'compress' | 'watermark'>;
  outputFormat?: 'jpeg' | 'png' | 'webp';
}

interface GenerateThumbnailData {
  imageUrl: string;
  sizes: Array<{ width: number; height: number }>;
}

export const processImageJob: JobDefinition<ProcessImageData, string> = {
  name: 'process-image',
  processor: async (job) => {
    const { imageUrl, operations, outputFormat } = job.data;

    console.log(`Processing image: ${imageUrl}`);

    await job.updateProgress(10);

    /**
     * for
     */
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      console.log(`Applying operation: ${operation}`);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await job.updateProgress((i + 1) / operations.length * 80);
    }

    const outputUrl = `processed-${Date.now()}.${outputFormat || 'jpeg'}`;

    await job.updateProgress(100);

    console.log(`Image processed successfully: ${outputUrl}`);

    return outputUrl;
  },
  options: {
    concurrency: 3,
  },
};

export const generateThumbnailJob: JobDefinition<GenerateThumbnailData, string[]> = {
  name: 'generate-thumbnail',
  processor: async (job) => {
    const { imageUrl, sizes } = job.data;
    const thumbnails: string[] = [];

    console.log(`Generating ${sizes.length} thumbnails for ${imageUrl}`);

    /**
     * for
     */
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      console.log(`Generating thumbnail ${i + 1}/${sizes.length}: ${size.width}x${size.height}`);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thumbnailUrl = `thumb-${size.width}x${size.height}-${Date.now()}.jpeg`;
      thumbnails.push(thumbnailUrl);

      await job.updateProgress((i + 1) / sizes.length * 100);
    }

    console.log(`Generated ${thumbnails.length} thumbnails`);
    return thumbnails;
  },
  options: {
    concurrency: 4,
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
};
