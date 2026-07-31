import { env } from "../../env";

export async function embedImage(buffer: Buffer): Promise<number[]> {
  const endpoint = process.env.AZURE_VISION_ENDPOINT;
  const key = process.env.AZURE_VISION_KEY;

  if (!endpoint || !key) {
    throw new Error("Azure Vision API is not configured. Missing AZURE_VISION_ENDPOINT or AZURE_VISION_KEY.");
  }

  // Ensure endpoint is well-formed
  const url = new URL(
    "/computervision/retrieval:vectorizeImage?api-version=2024-02-01&modelVersion=latest",
    endpoint.replace(/\/$/, "")
  ).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/octet-stream",
    },
    body: buffer as any,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure Vision API error: ${response.status} ${response.statusText} - ${errText}`);
  }

  const data = await response.json();
  // Azure returns { vector: [ ... ] }
  if (!data.vector || !Array.isArray(data.vector)) {
    throw new Error("Invalid response from Azure Vision API: missing vector array.");
  }

  return data.vector;
}
