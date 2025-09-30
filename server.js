import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import RateLimit from "express-rate-limit";
import { z } from "zod";
import multer from "multer";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const requiredEnv = [
  "TO_EMAIL",
  "FROM_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn(
    `Warning: Missing env vars: ${missingEnv.join(", ")}. Email sending will be disabled.`
  );
}

app.use(express.static(__dirname));
app.use(express.json());

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

// Email transport (conditional)
let mailer;
if (missingEnv.length === 0) {
  const port = Number(process.env.SMTP_PORT) || 587;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
}

// Rate limiters
const formLimiter = RateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Helpers
function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function normalizeUrlIfPresent(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  // If no scheme, default to https://
  const withScheme = /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme;
}

const toOptionalUrl = z.preprocess(
  (v) => normalizeUrlIfPresent(v),
  z
    .string()
    .url({ message: "Enter a complete URL including https://" })
    .optional()
);

const toOptionalText = z
  .preprocess((v) => (typeof v === "string" ? sanitizeText(v) : v), z.string().optional());

const waitlistSchema = z.object({
  firstName: z.string().optional().transform(sanitizeText),
  email: z.string().email({ message: "Enter a valid email like name@example.com" }),
  experience: z.string().min(1, { message: "Select how you want to experience Afro Japan" }).transform(sanitizeText),
  hype: z.string().max(500).optional().transform(sanitizeText),
  platform: z.array(z.string()).optional(),
  earlyAccess: z.boolean().optional(),
  consent: z.boolean(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
});

const applicationSchema = z.object({
  jobPosition: z.string().min(1, { message: "Select a job position" }).transform(sanitizeText),
  fullName: z.string().min(1, { message: "Enter your full name" }).transform(sanitizeText),
  email: z.string().email({ message: "Enter a valid email like name@example.com" }),
  location: z.string().min(1, { message: "Enter your city, country, and time zone" }).transform(sanitizeText),
  flagshipUrl: z
    .preprocess((v) => normalizeUrlIfPresent(v), z.string().url({ message: "Enter a complete URL including https://" })),
  flagshipSummary: z.string().min(1, { message: "Add 1–3 sentences about what you built" }).max(1000).transform(sanitizeText),
  motivation: z.string().min(1, { message: "Tell us why Camp of Creatives in 1–3 sentences" }).max(1000).transform(sanitizeText),
  workAuth: z.string().min(1, { message: "Select your work authorization status" }).transform(sanitizeText),
  linkGithub: toOptionalUrl,
  linkPortfolio: toOptionalUrl,
  linkLinkedIn: toOptionalUrl,
  linkReel: toOptionalUrl,
  startDate: toOptionalText,
  referral: toOptionalText,
  // engineering
  engineeringWork: toOptionalUrl,
  engineeringStack: toOptionalText,
  // art
  artReel: toOptionalUrl,
  artEngines: toOptionalText,
  artCredits: toOptionalText,
  // ops
  opsLaunch: toOptionalText,
  userAgent: z.string().optional(),
  ip: z.string().optional(),
});

// Multer for resume uploads (allow any file type; size-limited)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post("/api/world-preview", async (req, res) => {
  const { image_url, labels_fg1, labels_fg2, classes } = req.body || {};

  if (!image_url || !labels_fg1 || !labels_fg2 || !classes) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Resolve the image path relative to our server and fetch it,
    // so we can send a binary blob (Fal client will auto-upload it).
    const base = `${req.protocol}://${req.get("host")}`;
    const resolvedUrl = new URL(image_url, base).href;
    const imgResp = await fetch(resolvedUrl);
    if (!imgResp.ok) {
      return res.status(400).json({ error: `Unable to fetch source image: ${imgResp.status}` });
    }
    const imgBlob = await imgResp.blob();

    const result = await fal.subscribe("fal-ai/hunyuan_world/image-to-world", {
      input: { image_url: imgBlob, labels_fg1, labels_fg2, classes },
      logs: true,
    });

    const file = result?.data?.world_file;

    if (!file?.url) {
      return res.status(502).json({ error: "Fal response missing world_file" });
    }

    return res.status(200).json(file);
  } catch (error) {
    console.error("Fal generation failed", error);
    return res.status(500).json({ error: "Fal generation failed" });
  }
});

// Waitlist submission endpoint
app.post("/api/waitlist", formLimiter, async (req, res) => {
  try {
    const parsed = waitlistSchema.parse({
      ...req.body,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    if (!mailer) {
      return res.status(503).json({ error: "Email service not configured" });
    }

    const subject = `[Waitlist] Afro Japan — ${parsed.firstName || "Guest"} (${parsed.experience})`;
    const text = [
      `New waitlist signup`,
      `Time: ${new Date().toISOString()}`,
      `Name: ${parsed.firstName || ""}`,
      `Email: ${parsed.email}`,
      `Experience: ${parsed.experience}`,
      `Hype: ${parsed.hype || ""}`,
      `Platforms: ${(parsed.platform || []).join(", ")}`,
      `Early Access: ${parsed.earlyAccess ? "Yes" : "No"}`,
      `Consent: ${parsed.consent ? "Yes" : "No"}`,
      `IP: ${parsed.ip || ""}`,
      `UA: ${parsed.userAgent || ""}`,
    ].join("\n");

    await mailer.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.TO_EMAIL,
      subject,
      text,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.warn("Waitlist validation failed", err.issues);
      return res.status(400).json({ error: "Invalid input", fields: err.flatten().fieldErrors });
    }
    console.error("Waitlist error", err);
    return res.status(500).json({ error: "Failed to process waitlist" });
  }
});

// Job application endpoint
app.post(
  "/api/apply",
  formLimiter,
  upload.single("resume"),
  async (req, res) => {
    try {
      const body = { ...req.body, userAgent: req.get("user-agent"), ip: req.ip };
      const parsed = applicationSchema.parse(body);

      if (!req.file) {
        return res.status(400).json({ error: "Resume is required" });
      }

      if (!mailer) {
        return res.status(503).json({ error: "Email service not configured" });
      }

      const subject = `[Application] ${parsed.jobPosition} — ${parsed.fullName}`;
      const lines = [
        `New job application`,
        `Time: ${new Date().toISOString()}`,
        `Name: ${parsed.fullName}`,
        `Email: ${parsed.email}`,
        `Position: ${parsed.jobPosition}`,
        `Location: ${parsed.location}`,
        `Work Auth: ${parsed.workAuth}`,
        `Flagship URL: ${parsed.flagshipUrl}`,
        `Flagship Summary: ${parsed.flagshipSummary}`,
        `Motivation: ${parsed.motivation}`,
        `Links:`,
        `  GitHub: ${parsed.linkGithub || ""}`,
        `  Portfolio: ${parsed.linkPortfolio || ""}`,
        `  LinkedIn: ${parsed.linkLinkedIn || ""}`,
        `  Reel: ${parsed.linkReel || ""}`,
        `Optional:`,
        `  Start Date: ${parsed.startDate || ""}`,
        `  Referral: ${parsed.referral || ""}`,
        `Conditional:`,
        `  Engineering Work: ${parsed.engineeringWork || ""}`,
        `  Engineering Stack: ${parsed.engineeringStack || ""}`,
        `  Art Reel: ${parsed.artReel || ""}`,
        `  Art Engines: ${parsed.artEngines || ""}`,
        `  Art Credits: ${parsed.artCredits || ""}`,
        `  Ops Launch: ${parsed.opsLaunch || ""}`,
        `IP: ${parsed.ip || ""}`,
        `UA: ${parsed.userAgent || ""}`,
      ];

      await mailer.sendMail({
        from: process.env.FROM_EMAIL,
        to: process.env.TO_EMAIL,
        subject,
        text: lines.join("\n"),
        attachments: [
          {
            filename: req.file.originalname,
            content: req.file.buffer,
            contentType: req.file.mimetype,
          },
        ],
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn("Apply validation failed", err.issues);
        return res.status(400).json({ error: "Invalid input", fields: err.flatten().fieldErrors });
      }
      console.error("Apply error", err);
      return res.status(500).json({ error: "Failed to submit application" });
    }
  }
);

// Centralized error handler (handles Multer/file and other errors)
app.use((err, _req, res, _next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Resume must be 10 MB or smaller" });
  }
  if (err && /Invalid file type/i.test(String(err.message))) {
    return res.status(400).json({ error: "Resume must be PDF, DOC, or DOCX" });
  }
  console.error("Unhandled server error", err);
  return res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
