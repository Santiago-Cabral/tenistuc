import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { showAlert } from './appAlert';

export interface PickedImage {
    uri: string;
    mimeType: string;
    fileName: string;
}

export interface PickImageOptions {
    aspect?: [number, number];
    quality?: number;
}

export async function pickImage(options: PickImageOptions = {}): Promise<PickedImage | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        showAlert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir una imagen.');
        return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.75,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.uri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg');

    return {
        uri: asset.uri,
        mimeType,
        fileName: asset.fileName ?? `image.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
    };
}

export async function readImageBytes(uri: string): Promise<ArrayBuffer> {
    const file = new FileSystem.File(uri);
    const bytes = await file.bytes();
    return bytes.buffer as ArrayBuffer;
}
