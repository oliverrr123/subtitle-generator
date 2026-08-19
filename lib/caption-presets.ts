export const captionPresetIds = [
  "neon-glow",
  "clean-pill",
  "tiktok-pop",
  "karaoke-yellow",
  "meme-stroke",
  "creator-gradient",
  "dark-bar",
  "minimal-soft",
  "bubblegum",
  "editorial",
] as const;

export type CaptionPresetId = (typeof captionPresetIds)[number];

export type CaptionPreset = {
  id: CaptionPresetId;
  name: string;
  description: string;
};

export const defaultCaptionPresetId: CaptionPresetId = "neon-glow";

export const captionPresets: CaptionPreset[] = [
  {
    id: "neon-glow",
    name: "Instagram",
    description: "Classic white Instagram captions with a thin black outline.",
  },
  {
    id: "clean-pill",
    name: "Clean Pill",
    description: "Rounded white box with word-by-word emphasis.",
  },
  {
    id: "tiktok-pop",
    name: "TikTok Pop",
    description: "Big black text with bright yellow active words.",
  },
  {
    id: "karaoke-yellow",
    name: "Karaoke",
    description: "Floating yellow lyrics with a bold black stroke.",
  },
  {
    id: "meme-stroke",
    name: "Meme Bold",
    description: "All-caps white text with a heavy outline.",
  },
  {
    id: "dark-bar",
    name: "Dark Bar",
    description: "High-contrast lower-third captions.",
  },
  {
    id: "minimal-soft",
    name: "Minimal",
    description: "Small, clean captions with a soft shadow.",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Refined serif-style box for premium explainers.",
  },
];

export function isCaptionPresetId(value: unknown): value is CaptionPresetId {
  return captionPresetIds.includes(value as CaptionPresetId);
}
