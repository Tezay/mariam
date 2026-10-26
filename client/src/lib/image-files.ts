// The server's own rule (StorageService.validate_image), said before the file is sent. By
// extension, as the server does: a HEIC often comes with no type at all.
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
export const IMAGE_MAX_MB = 5;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,.heic,.heif';

export function imageFileProblem(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS.includes(extension)) {
    return 'Format non pris en charge : JPEG, PNG, GIF, WebP ou HEIC.';
  }
  if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
    return `Image trop lourde : ${IMAGE_MAX_MB} Mo au plus.`;
  }
  return null;
}
