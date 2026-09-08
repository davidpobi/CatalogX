import "server-only";
import { toFile } from "openai";
import { getOpenAI } from "../config/openai";

export const transcribeAudio = async (file: File) => {
  const bytes = Buffer.from(await file.arrayBuffer());
  const response = await getOpenAI().audio.transcriptions.create({
    model: "gpt-transcribe",
    file: await toFile(bytes, file.name || "catalog-search.webm", { type: file.type }),
    prompt: "Home furniture, décor, materials, dimensions, rooms, prices, and delivery preferences.",
  });
  return response.text.trim();
};
