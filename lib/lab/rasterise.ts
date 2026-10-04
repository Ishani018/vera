/**
 * Two small browser helpers for the Lab's downloads. Browser only: they use the DOM.
 */

/** Draw an SVG onto a canvas and hand back a PNG, for a drawing that exists only as curves. */
export async function svgToPng(svg: string, longEdge = 1400): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = longEdge / Math.max(image.naturalWidth, image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the result.');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the PNG.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a blob as a file, the way a download link does. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
