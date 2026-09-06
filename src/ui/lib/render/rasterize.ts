import { clamp } from '@shared/settings';

/** Figma rejects images beyond this edge length. */
export const MAX_IMAGE_SIZE = 4096;

/** The resolution an image fill is rendered at for a node of the given size. */
export function fillResolution(width: number, height: number): number {
  return clamp(Math.ceil(Math.max(width, height) * 2), 128, 2048);
}

async function loadImage(svg: string): Promise<CanvasImageSource> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Some engines refuse SVG bitmaps, the element path below still works.
    }
  }

  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();

    image.decoding = 'async';
    image.src = url;
    await image.decode();

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(canvas: OffscreenCanvas | HTMLCanvasElement, image: CanvasImageSource, size: number): void {
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (!context) {
    throw new Error('The canvas has no 2D context.');
  }

  context.drawImage(image, 0, 0, size, size);
}

/**
 * Renders an SVG to PNG bytes at `px` square. The SVG has to carry its own
 * width and height, which the renderer writes when it is given a size.
 */
export async function svgToPng(svg: string, px: number): Promise<Uint8Array> {
  const size = clamp(Math.round(px), 1, MAX_IMAGE_SIZE);
  const image = await loadImage(svg);
  let blob: Blob | null;

  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(size, size);

    draw(canvas, image, size);
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else {
    const canvas = document.createElement('canvas');

    canvas.width = size;
    canvas.height = size;
    draw(canvas, image, size);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  if (!blob) {
    throw new Error('The canvas produced no image.');
  }

  return new Uint8Array(await blob.arrayBuffer());
}
