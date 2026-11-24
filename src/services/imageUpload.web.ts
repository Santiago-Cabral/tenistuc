import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
    uri: string;
    mimeType: string;
    fileName: string;
}

export interface PickImageOptions {
    aspect?: [number, number];
    quality?: number;
}

const MAX_SIZE = 1024;

export async function pickImage(_options: PickImageOptions = {}): Promise<PickedImage | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    return {
        uri: asset.uri,
        mimeType: 'image/jpeg',
        fileName: asset.fileName ?? 'image.jpg',
    };
}

export async function readImageBytes(uri: string): Promise<ArrayBuffer> {
    const response = await fetch(uri);
    const blob = await response.blob();
    const bitmap = await (globalThis as any).createImageBitmap(blob);

    const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la imagen en este navegador.');
    context.drawImage(bitmap, 0, 0, width, height);

    const compressed = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (result) => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen.')),
            'image/jpeg',
            0.8
        );
    });

    return await compressed.arrayBuffer();
}
