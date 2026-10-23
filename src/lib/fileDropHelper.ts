import type { SlagAttachment } from '../types';

export async function processFileListToAttachments(fileList: FileList | File[]): Promise<SlagAttachment[]> {
  const files = Array.from(fileList);
  const attachments: SlagAttachment[] = [];

  for (const file of files) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
    let type: SlagAttachment['type'] = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else if (file.type.startsWith('video/')) type = 'video';

    attachments.push({
      id,
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      relativePath: `.attachments/${id}_${file.name}`,
      dataUrl,
    });
  }

  return attachments;
}
