import { dataUrlToFile } from './ocr';

export async function captureMenuPhoto(): Promise<File | null> {
  try {
    const module = await import('@capacitor/camera');
    const image = await module.Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: module.CameraResultType.DataUrl,
      source: module.CameraSource.Camera,
      promptLabelHeader: 'Scanner un menu',
      promptLabelPhoto: 'Prendre une photo',
      promptLabelPicture: 'Choisir une image',
    });

    if (!image.dataUrl) return null;
    return dataUrlToFile(image.dataUrl, `menu-camera-${Date.now()}.jpg`);
  } catch {
    return null;
  }
}
