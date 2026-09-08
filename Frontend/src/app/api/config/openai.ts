import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

export const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  client ??= new OpenAI({ apiKey });
  return client;
};
