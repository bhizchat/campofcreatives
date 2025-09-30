import { fal } from "@fal-ai/client";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { image_url, labels_fg1, labels_fg2, classes } = req.body || {};

  if (!process.env.FAL_KEY) {
    return res.status(500).json({ error: "FAL_KEY not configured" });
  }
  fal.config({ credentials: process.env.FAL_KEY });

  if (!image_url || !labels_fg1 || !labels_fg2 || !classes) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await fal.subscribe("fal-ai/hunyuan_world/image-to-world", {
      input: { image_url, labels_fg1, labels_fg2, classes },
      logs: false,
    });
    const file = result?.data?.world_file || {};
    return res.status(200).json(file);
  } catch (e) {
    return res.status(500).json({ error: "Fal generation failed" });
  }
}


