export const DEFAULT_CAPTURE_MAX_LONG_EDGE = 1280;

/**
 * Prompts for a display/window/tab via Screen Capture API, samples one video frame as PNG, then stops all tracks.
 */
export async function captureDisplayMediaAsPngDataUrl(options?: {
  maxLongEdge?: number;
}): Promise<string> {
  const maxLongEdge = options?.maxLongEdge ?? DEFAULT_CAPTURE_MAX_LONG_EDGE;
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser.');
  }

  const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  try {
    await video.play();
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }
      const onData = () => {
        video.removeEventListener('loadeddata', onData);
        video.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        video.removeEventListener('loadeddata', onData);
        video.removeEventListener('error', onErr);
        reject(new Error('Could not load video frame from capture.'));
      };
      video.addEventListener('loadeddata', onData);
      video.addEventListener('error', onErr);
    });

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      throw new Error('Could not read capture dimensions.');
    }

    let cw = w;
    let ch = h;
    if (Math.max(w, h) > maxLongEdge) {
      const scale = maxLongEdge / Math.max(w, h);
      cw = Math.round(w * scale);
      ch = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create canvas context.');
    }
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
