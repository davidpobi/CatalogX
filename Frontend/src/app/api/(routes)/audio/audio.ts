import { parseBuffer } from "music-metadata";
import type { ApiRouteResult } from "@/interfaces/api";
import { AudioOperations, type AudioTranscriptionData } from "@/interfaces/audio";
import { transcribeAudio } from "../../services/transcription.service";
import { failure } from "../../utils/httpUtils";

const supportedTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a"]);

export const handleTranscription = async (form: FormData): Promise<ApiRouteResult<AudioTranscriptionData>> => {
  if (form.get("operation") !== AudioOperations.TranscribeAudio) return failure(400, "Invalid operation.");
  const file = form.get("audio");
  if (!(file instanceof File) || !file.size || file.size > 12_000_000 || !supportedTypes.has(file.type)) return failure(422, "A supported audio recording under 12 MB is required.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let duration = 0;
  try { duration = (await parseBuffer(bytes, { mimeType: file.type, size: file.size })).format.duration || 0; } catch { return failure(422, "The recording could not be inspected."); }
  if (!duration || duration > 30.5) return failure(422, "Recordings must be 30 seconds or shorter.");
  const transcript = await transcribeAudio(new File([bytes], file.name, { type: file.type }));
  if (!transcript) return failure(422, "No speech was detected.");
  return { status: 200, data: { transcript } };
};
