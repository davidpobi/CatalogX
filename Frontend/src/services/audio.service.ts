import { AudioOperations, type AudioTranscriptionData } from "@/interfaces/audio";
import { normalizeApiError, postFormApi } from "./apiClient.service";

export const transcribeSearchAudio = async (audio: Blob, signal?: AbortSignal) => {
  try {
    const form = new FormData();
    form.set("operation", AudioOperations.TranscribeAudio);
    form.set("audio", audio, "catalog-search.webm");
    return await postFormApi<AudioTranscriptionData>("/api/audio", form, signal);
  } catch (error) {
    throw normalizeApiError(error, "Voice search is temporarily unavailable.");
  }
};
