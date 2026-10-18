// Android: save the Word file in the app's cache and open the share sheet (WhatsApp / Drive / Print / Word).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function saveFile(name: string, bytes: Uint8Array): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: DOCX, dialogTitle: name, UTI: 'org.openxmlformats.wordprocessingml.document' });
  }
}
