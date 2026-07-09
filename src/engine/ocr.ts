import { createWorker } from 'tesseract.js';
import type { OcrAdvancedReport } from '../types';
import { autoCorrectOcrMenuText, buildOcrAdvancedReport } from './advancedOcr';
import { parseMenuText } from './menuParser';

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface AdvancedOcrResult {
  text: string;
  report: OcrAdvancedReport;
}

export async function readMenuImage(file: File, onProgress?: (progress: OcrProgress) => void): Promise<string> {
  const prepared = await preprocessImageForOcr(file);
  const worker = await createWorker('fra+eng', 1, {
    logger: (message: { status?: unknown; progress?: unknown }) => {
      if (onProgress && typeof message.progress === 'number') {
        onProgress({ status: String(message.status ?? 'OCR'), progress: message.progress });
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(prepared);
    return cleanupOcrText(result.data.text);
  } finally {
    await worker.terminate();
  }
}


export async function readMenuImageAdvanced(file: File, onProgress?: (progress: OcrProgress) => void): Promise<AdvancedOcrResult> {
  const rawText = await readMenuImage(file, onProgress);
  const text = autoCorrectOcrMenuText(rawText);
  const items = parseMenuText(text);
  return {
    text,
    report: buildOcrAdvancedReport(text, items, file.name),
  };
}

export function fileToImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture image impossible'));
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, fileName = 'menu-camera.jpg'): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
}

async function preprocessImageForOcr(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const image = await loadImage(file);
    const maxWidth = 1800;
    const scale = image.width > maxWidth ? maxWidth / image.width : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  } catch {
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image non lisible'));
    };
    image.src = url;
  });
}

function cleanupOcrText(text: string): string {
  return autoCorrectOcrMenuText(text);
}
