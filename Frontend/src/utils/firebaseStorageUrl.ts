export const firebaseDownloadToken = (url: string | null | undefined) => {
  if (!url) return null;
  try { return new URL(url).searchParams.get("token"); } catch { return null; }
};

export const firebaseDownloadUrl = (bucket: string, storagePath: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
