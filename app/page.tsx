"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Download, Film, RotateCcw, Upload, WandSparkles } from "lucide-react";
import {
  defaultCaptionSettings,
  getActiveCaption,
  groupWordsIntoLines,
  type CaptionLine,
  type WordTiming,
} from "@/lib/captions";

type JobState =
  | "idle"
  | "transcribing"
  | "ready"
  | "rendering"
  | "rendered"
  | "error";

type RenderJobStatus = {
  status: "queued" | "rendering" | "done" | "error";
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  url?: string;
  error?: string;
};

type EditableCaptionLine = CaptionLine & {
  startIndex: number;
  text: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.max(0, seconds - minutes * 60);
  return minutes + ":" + remainingSeconds.toFixed(1).padStart(4, "0");
}

function splitCaptionText(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function isVideoFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  return (
    file.type.startsWith("video/") ||
    ["mp4", "mov", "webm", "m4v"].includes(extension ?? "")
  );
}

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [words, setWords] = useState<WordTiming[]>([]);
  const [transcript, setTranscript] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [maxWordsPerLine, setMaxWordsPerLine] = useState(
    defaultCaptionSettings.maxWordsPerLine,
  );
  const [maxLineDuration, setMaxLineDuration] = useState(
    defaultCaptionSettings.maxLineDuration,
  );
  const [captionSize, setCaptionSize] = useState(3.2);
  const [captionWidth, setCaptionWidth] = useState(66);
  const [state, setState] = useState<JobState>("idle");
  const [status, setStatus] = useState("Drop in a clip to start.");
  const [renderUrl, setRenderUrl] = useState("");
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  const captionLines = useMemo<CaptionLine[]>(
    () =>
      groupWordsIntoLines(words, {
        ...defaultCaptionSettings,
        maxWordsPerLine,
        maxLineDuration,
      }),
    [maxLineDuration, maxWordsPerLine, words],
  );
  const editableCaptionLines = useMemo<EditableCaptionLine[]>(() => {
    let startIndex = 0;

    return captionLines.map((line) => {
      const editableLine = {
        ...line,
        startIndex,
        text: line.words.map((word) => word.word).join(" "),
      };
      startIndex += line.words.length;
      return editableLine;
    });
  }, [captionLines]);
  const activeCaption = getActiveCaption(captionLines, currentTime);
  const isBusy = state === "transcribing" || state === "rendering";
  const canTranscribe = Boolean(videoFile) && !isBusy;
  const canRender = Boolean(videoFile && captionLines.length && duration) && !isBusy;

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function loadVideoFile(file: File) {
    if (!isVideoFile(file)) {
      setState("error");
      setStatus("Drop a video file, like MP4, MOV, or WebM.");
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setDuration(0);
    setWords([]);
    setTranscript("");
    setRenderUrl("");
    setCurrentTime(0);
    setState("idle");
    setStatus(file.name + " is ready.");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    loadVideoFile(file);
    event.target.value = "";
  }

  function handleVideoDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!isBusy) {
      event.dataTransfer.dropEffect = "copy";
      setIsDraggingVideo(true);
    }
  }

  function handleVideoDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingVideo(false);
    }
  }

  function handleVideoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingVideo(false);

    if (isBusy) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    loadVideoFile(file);
  }

  async function transcribeVideo() {
    if (!videoFile) return;

    setState("transcribing");
    setStatus("Extracting audio and generating word timestamps...");
    setRenderUrl("");

    const formData = new FormData();
    formData.append("video", videoFile);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      setState("error");
      setStatus(result.error ?? "Transcription failed.");
      return;
    }

    setWords(result.words ?? []);
    setTranscript(result.text ?? "");
    setState("ready");
    setStatus(`Generated ${result.words?.length ?? 0} word timestamps.`);
  }

  function updateCaptionLine(line: EditableCaptionLine, text: string) {
    const tokens = splitCaptionText(text);

    setWords((previousWords) => {
      const startIndex = Math.min(line.startIndex, previousWords.length);
      const endIndex = Math.min(startIndex + line.words.length, previousWords.length);
      const lineDuration = Math.max(0.04 * Math.max(tokens.length, 1), line.end - line.start);
      const step = tokens.length ? lineDuration / tokens.length : 0;
      const nextLineWords: WordTiming[] = tokens.map((word, index) => {
        const start = line.start + step * index;
        const end = index === tokens.length - 1 ? line.start + lineDuration : line.start + step * (index + 1);

        return {
          word,
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
        };
      });
      const nextWords = [
        ...previousWords.slice(0, startIndex),
        ...nextLineWords,
        ...previousWords.slice(endIndex),
      ];

      setTranscript(nextWords.map((word) => word.word).join(" "));
      return nextWords;
    });

    setRenderUrl("");
    if (state === "rendered" || state === "error") {
      setState("ready");
    }
    setStatus(tokens.length ? "Caption text updated." : "Caption line removed.");
  }

  async function renderVideo() {
    if (!videoFile || !captionLines.length || !duration) return;

    setState("rendering");
    setStatus("Starting render...");

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append(
      "payload",
      JSON.stringify({
        durationInSeconds: duration,
        lines: captionLines,
        style: {
          fontSizePercent: captionSize,
          maxWidthPercent: captionWidth,
        },
      }),
    );

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        setState("error");
        setStatus(result.error ?? "Render failed.");
        return;
      }

      const jobId = String(result.jobId);

      while (true) {
        await wait(2000);
        const statusResponse = await fetch(
          "/api/render?jobId=" + encodeURIComponent(jobId),
          { cache: "no-store" },
        );
        const job = (await statusResponse.json()) as RenderJobStatus;

        if (!statusResponse.ok) {
          setState("error");
          setStatus(job.error ?? "Render status failed.");
          return;
        }

        if (job.status === "done" && job.url) {
          setRenderUrl(job.url);
          setState("rendered");
          setStatus("Rendered video is ready.");
          return;
        }

        if (job.status === "error") {
          setState("error");
          setStatus(job.error ?? "Render failed.");
          return;
        }

        setStatus(
          "Rendering the subtitled MP4... " +
            job.progress +
            "% (" +
            job.renderedFrames +
            " rendered / " +
            job.encodedFrames +
            " encoded)",
        );
      }
    } catch (error) {
      setState("error");
      setStatus(error instanceof Error ? error.message : "Render failed.");
    }
  }

  function resetProject() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl("");
    setDuration(0);
    setWords([]);
    setTranscript("");
    setCurrentTime(0);
    setRenderUrl("");
    setState("idle");
    setStatus("Drop in a clip to start.");
  }

  return (
    <main className="app-shell">
      <div className="workspace">
        <aside className="control-panel">
          <div className="brand-row">
            <div className="brand">
              <h1>Subtitle Generator</h1>
              <p>Word-by-word captions for short horizontal clips.</p>
            </div>
            <div className="badge">MVP</div>
          </div>

          <label
            className={`dropzone ${isDraggingVideo ? "dragging" : ""}`}
            onDragOver={handleVideoDragOver}
            onDragLeave={handleVideoDragLeave}
            onDrop={handleVideoDrop}
          >
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
              onChange={handleFileChange}
              disabled={isBusy}
            />
            <div className="drop-content">
              <div className="drop-icon">
                <Upload size={22} />
              </div>
              <div>
                <p className="drop-title">
                  {isDraggingVideo
                    ? "Drop to upload"
                    : videoFile
                      ? videoFile.name
                      : "Upload video"}
                </p>
                <p className="drop-meta">Click or drag in MP4, MOV, or WebM</p>
              </div>
            </div>
          </label>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Caption Style</h2>
            </div>
            <label className="setting-row">
              <span className="setting-label">
                <strong>Words per line</strong>
                <span>Short-form caption chunks</span>
              </span>
              <input
                className="number-input"
                type="number"
                min="2"
                max="8"
                value={maxWordsPerLine}
                onChange={(event) =>
                  setMaxWordsPerLine(Number(event.target.value))
                }
              />
            </label>
            <label className="setting-row">
              <span className="setting-label">
                <strong>Line seconds</strong>
                <span>Maximum phrase duration</span>
              </span>
              <input
                className="number-input"
                type="number"
                min="1.4"
                max="4"
                step="0.1"
                value={maxLineDuration}
                onChange={(event) =>
                  setMaxLineDuration(Number(event.target.value))
                }
              />
            </label>
            <label className="setting-row setting-row-stacked">
              <span className="setting-label">
                <strong>Caption size</strong>
                <span>{captionSize.toFixed(1)}% of video width</span>
              </span>
              <input
                className="range-input"
                type="range"
                min="2"
                max="5.5"
                step="0.1"
                value={captionSize}
                onChange={(event) => setCaptionSize(Number(event.target.value))}
              />
            </label>
            <label className="setting-row setting-row-stacked">
              <span className="setting-label">
                <strong>Caption box</strong>
                <span>{captionWidth}% max width</span>
              </span>
              <input
                className="range-input"
                type="range"
                min="38"
                max="88"
                step="1"
                value={captionWidth}
                onChange={(event) =>
                  setCaptionWidth(Number(event.target.value))
                }
              />
            </label>
          </section>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={transcribeVideo}
              disabled={!canTranscribe}
            >
              <WandSparkles size={18} />
              Transcribe
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={renderVideo}
              disabled={!canRender}
            >
              <Film size={18} />
              Render
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={resetProject}
              disabled={isBusy && !videoFile}
              aria-label="Reset"
              title="Reset"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          <div className={`status-row ${state === "error" ? "error" : ""}`}>
            {isBusy ? <span className="spinner" /> : null}
            <span>{status}</span>
          </div>

          {renderUrl ? (
            <a className="download-link" href={renderUrl} download>
              <Download size={18} />
              Download MP4
            </a>
          ) : null}

          {editableCaptionLines.length ? (
            <section className="section caption-editor">
              <div className="section-header">
                <h2 className="section-title">Caption Editor</h2>
                <span className="caption-count">{editableCaptionLines.length}</span>
              </div>
              <div className="caption-edit-list">
                {editableCaptionLines.map((line) => (
                  <label
                    className="caption-edit-row"
                    key={line.id + "-" + line.start + "-" + line.end + "-" + line.text}
                  >
                    <span className="caption-time">
                      {formatTimestamp(line.start)} - {formatTimestamp(line.end)}
                    </span>
                    <textarea
                      className="caption-textarea"
                      defaultValue={line.text}
                      disabled={isBusy}
                      rows={2}
                      spellCheck
                      onBlur={(event) =>
                        updateCaptionLine(line, event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {transcript ? (
            <section className="section">
              <h2 className="section-title">Transcript</h2>
              <div className="transcript-box">{transcript}</div>
            </section>
          ) : null}
        </aside>

        <section className="preview-panel">
          <div className="preview-stage">
            <div className="video-wrap">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  onLoadedMetadata={(event) =>
                    setDuration(event.currentTarget.duration)
                  }
                  onTimeUpdate={(event) =>
                    setCurrentTime(event.currentTarget.currentTime)
                  }
                />
              ) : (
                <div className="empty-preview">
                  <div>
                    <Film size={34} />
                    <p>Video preview</p>
                  </div>
                </div>
              )}

              {activeCaption ? (
                <div className="caption-overlay">
                  <div
                    className="caption-pill"
                    style={
                      {
                        "--caption-size": captionSize,
                        "--caption-width": `${captionWidth}%`,
                      } as CSSProperties
                    }
                  >
                    {activeCaption.words.map((word, index) => (
                      <span
                        className={`caption-word ${
                          currentTime >= word.start ? "active" : ""
                        }`}
                        key={`${word.word}-${index}`}
                      >
                        {word.word}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
