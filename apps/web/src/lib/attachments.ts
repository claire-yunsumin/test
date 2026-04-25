import type { TaskAttachment } from "@hwe/shared";

export function attachmentSource(raw: string, attachmentsById: Map<string, TaskAttachment>) {
  if (!raw.startsWith("attachment://")) return raw;
  const attachmentId = raw.slice("attachment://".length);
  const attachment = attachmentsById.get(attachmentId);
  if (!attachment) return "";
  return attachment.kind === "FILE" ? attachment.contentDataUrl ?? "" : attachment.url ?? "";
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}

export function formatAttachmentSize(size?: number) {
  return size ? `${Math.max(1, Math.round(size / 1024))}KB` : "";
}
