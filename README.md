# Subtitle Generator

A local Next.js app for generating short-form, word-by-word subtitles on horizontal videos. Upload a clip, transcribe it with OpenAI Whisper, edit the captions, tune the subtitle style, and render a subtitled MP4 with Remotion.

## Features

- Upload videos by clicking or drag-and-drop
- Transcribe speech with word-level timestamps
- Preview captions over the video
- Edit generated caption text before rendering
- Tune words per line, line duration, caption size, and caption box width
- Render a final MP4 with Remotion
- Background render job polling, so long renders do not kill the browser request

## Tech Stack

- Next.js 15
- React 19
- OpenAI audio transcription API
- Remotion for video rendering
- ffmpeg for audio extraction
- pnpm

## Requirements

- Node.js 22 LTS recommended
- pnpm
- An OpenAI API key
- ffmpeg available either from `ffmpeg-static` or installed on your machine

On macOS, if the bundled ffmpeg binary is missing, installing ffmpeg with Homebrew works:

```bash
brew install ffmpeg
```

## Setup

Install dependencies:

```bash
pnpm install
```

Create your local env file:

```bash
cp .env.local.example .env.local
```

Add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-key-here
```

Run the dev server:

```bash
pnpm run dev
```

Open:

```text
http://localhost:3000
```

## How To Use

1. Upload or drag in an MP4, MOV, WebM, or M4V video.
2. Click **Transcribe** to generate word-level captions.
3. Edit any generated caption lines in the caption editor.
4. Adjust the caption style controls if needed.
5. Click **Render** to generate the subtitled MP4.
6. Download the rendered video when the job finishes.

## Scripts

```bash
pnpm run dev        # Start the local Next.js dev server
pnpm run build      # Build the app
pnpm run start      # Start the production build
pnpm run typecheck  # Run TypeScript checks
pnpm run lint       # Run linting
```

## Project Structure

```text
app/
  api/transcribe/route.ts  # Extracts audio and sends it to OpenAI Whisper
  api/render/route.ts      # Starts and tracks Remotion render jobs
  page.tsx                 # Upload, preview, editor, and render UI
lib/
  captions.ts              # Caption grouping and active caption helpers
  ffmpeg.ts                # Audio extraction helper
  files.ts                 # Upload/render path helpers
remotion/
  root.tsx                 # Remotion composition setup
  subtitle-video.tsx       # Video + caption rendering component
```

## Notes

Generated uploads and rendered videos are ignored by Git:

- `uploads/`
- `public/renders/`
- `.next/`
- `node_modules/`

Renders can take several minutes for large videos. A 2-3 minute 300 MB clip may still take a while depending on the machine, video codec, and Remotion encoding speed.

## Current Limitations

- Render job state is stored in memory, so restarting the dev server clears active jobs.
- Caption text edits redistribute word timing across the original caption line duration.
- This is currently built as a local MVP, not a hosted multi-user service.
