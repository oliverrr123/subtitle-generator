"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  Download,
  Film,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Share2,
  Upload,
  WandSparkles,
} from "lucide-react";
import {
  defaultCaptionSettings,
  getActiveCaption,
  groupWordsIntoLines,
  type CaptionLine,
  type WordTiming,
} from "@/lib/captions";
import {
  captionPresets,
  defaultCaptionPresetId,
  type CaptionPresetId,
} from "@/lib/caption-presets";

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
  message?: string;
};

type EditableCaptionLine = CaptionLine & {
  startIndex: number;
  text: string;
};

type VideoDimensions = {
  width: number;
  height: number;
};

type PreviewOverlay = "none" | "tiktok" | "instagram";
type ExportFps = 24 | 30 | 60;
type VideoDefaults = {
  previewOverlay: PreviewOverlay;
  maxWordsPerLine: number;
  maxLineDuration: number;
  captionSize: number;
  captionWidth: number;
  captionBottom: number;
  exportFps: ExportFps;
};

const defaultVideoDimensions: VideoDimensions = {
  width: 1280,
  height: 720,
};

const previewOverlays: { id: PreviewOverlay; name: string }[] = [
  { id: "none", name: "None" },
  { id: "tiktok", name: "TikTok" },
  { id: "instagram", name: "Instagram" },
];

const exportFpsOptions: ExportFps[] = [24, 30, 60];

const verticalVideoDefaults: VideoDefaults = {
  previewOverlay: "tiktok",
  maxWordsPerLine: defaultCaptionSettings.maxWordsPerLine,
  maxLineDuration: defaultCaptionSettings.maxLineDuration,
  captionSize: 5.5,
  captionWidth: 88,
  captionBottom: 28,
  exportFps: 30,
};

const horizontalVideoDefaults: VideoDefaults = {
  previewOverlay: "none",
  maxWordsPerLine: 7,
  maxLineDuration: 2.6,
  captionSize: 4,
  captionWidth: 88,
  captionBottom: 14,
  exportFps: 60,
};

function getDefaultsForVideoDimensions(
  dimensions: VideoDimensions,
): VideoDefaults {
  return dimensions.width >= dimensions.height
    ? horizontalVideoDefaults
    : verticalVideoDefaults;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  const normalizedBody = bodyText.replace(/\s+/g, " ").trim();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bodyText) as T;
    } catch {
      const snippet = normalizedBody.slice(0, 180) || `HTTP ${response.status}`;
      throw new Error(`Server returned invalid JSON: ${snippet}`);
    }
  }

  const snippet = normalizedBody.slice(0, 180) || `HTTP ${response.status}`;
  throw new Error(`Server returned non-JSON response: ${snippet}`);
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

function PlatformOverlay({ type }: { type: Exclude<PreviewOverlay, "none"> }) {
  if (type === "instagram") {
    return (
      <div className="platform-overlay instagram-overlay" aria-hidden="true">
        <div className="platform-topbar">
          <strong>Reels</strong>
          <div className="platform-top-icons">
            <Search size={18} />
            <MoreHorizontal size={18} />
          </div>
        </div>
        <div className="platform-action-rail">
          <Heart size={22} />
          <span>12K</span>
          <MessageCircle size={22} />
          <span>248</span>
          <Send size={22} />
          <Bookmark size={22} />
          <MoreHorizontal size={22} />
        </div>
        <div className="platform-meta">
          <div className="platform-profile-row">
            <span className="platform-avatar" />
            <strong>@creator</strong>
            <span className="platform-follow">Follow</span>
          </div>
          <p>Caption preview area and description sit here...</p>
          <span className="platform-audio">Original audio - trending sound</span>
        </div>
        <div className="platform-home-indicator" />
        <div className="platform-progress" />
      </div>
    );
  }

  return (
    <div className="platform-overlay tiktok-overlay" aria-hidden="true">
      <div className="platform-topbar platform-centered-topbar">
        <span>Following</span>
        <strong>For You</strong>
      </div>
      <div className="platform-action-rail">
        <span className="platform-avatar platform-avatar-stacked">
          <Plus size={12} />
        </span>
        <Heart size={22} />
        <span>88K</span>
        <MessageCircle size={22} />
        <span>321</span>
        <Bookmark size={22} />
        <Share2 size={22} />
        <Music2 size={24} />
      </div>
      <div className="platform-meta">
        <strong>@creator</strong>
        <p>This is where the TikTok description and hashtags appear...</p>
        <span className="platform-audio">♪ Original sound - creator</span>
      </div>
      <div className="platform-tabbar">
        <span>Home</span>
        <span>Friends</span>
        <span>Inbox</span>
        <span>Profile</span>
      </div>
      <div className="platform-progress" />
    </div>
  );
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoDwigerFileKeyRef = useRef("");
  const autoAppliedDefaultsRef = useRef(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions>(
    defaultVideoDimensions,
  );
  const [duration, setDuration] = useState(0);
  const [words, setWords] = useState<WordTiming[]>([]);
  const [transcript, setTranscript] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [maxWordsPerLine, setMaxWordsPerLine] = useState(
    verticalVideoDefaults.maxWordsPerLine,
  );
  const [maxLineDuration, setMaxLineDuration] = useState(
    verticalVideoDefaults.maxLineDuration,
  );
  const [captionSize, setCaptionSize] = useState(verticalVideoDefaults.captionSize);
  const [captionWidth, setCaptionWidth] = useState(verticalVideoDefaults.captionWidth);
  const [captionBottom, setCaptionBottom] = useState(verticalVideoDefaults.captionBottom);
  const [captionPresetId, setCaptionPresetId] = useState<CaptionPresetId>(
    defaultCaptionPresetId,
  );
  const [previewOverlay, setPreviewOverlay] =
    useState<PreviewOverlay>(verticalVideoDefaults.previewOverlay);
  const [dwigerMode, setDwigerMode] = useState(false);
  const [exportFps, setExportFps] = useState<ExportFps>(verticalVideoDefaults.exportFps);
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
  const platformProgress = duration
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!dwigerMode || !videoFile || isBusy) return;

    const fileKey = `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}`;
    if (autoDwigerFileKeyRef.current === fileKey) return;

    autoDwigerFileKeyRef.current = fileKey;
    void transcribeVideo();
  }, [dwigerMode, videoFile, isBusy]);

  function applyVideoDefaults(dimensions: VideoDimensions) {
    const defaults = getDefaultsForVideoDimensions(dimensions);
    setPreviewOverlay(defaults.previewOverlay);
    setMaxWordsPerLine(defaults.maxWordsPerLine);
    setMaxLineDuration(defaults.maxLineDuration);
    setCaptionSize(defaults.captionSize);
    setCaptionWidth(defaults.captionWidth);
    setCaptionBottom(defaults.captionBottom);
    setExportFps(defaults.exportFps);
  }

  function loadVideoFile(file: File) {
    if (!isVideoFile(file)) {
      setState("error");
      setStatus("Drop a video file, like MP4, MOV, or WebM.");
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoDimensions(defaultVideoDimensions);
    autoAppliedDefaultsRef.current = false;
    autoDwigerFileKeyRef.current = "";
    setDuration(0);
    setWords([]);
    setTranscript("");
    setRenderUrl("");
    setCurrentTime(0);
    setState("idle");
    setStatus(
      dwigerMode
        ? file.name + " is ready. Starting Dwiger mode..."
        : file.name + " is ready.",
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    loadVideoFile(file);
    event.target.value = "";
  }

  function togglePreviewPlayback() {
    if (previewOverlay === "none") return;

    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
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
    setStatus(
      dwigerMode
        ? "Extracting audio, transcribing, and rewriting subtitles into Czech..."
        : "Extracting audio and generating word timestamps...",
    );
    setRenderUrl("");

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("dwigerMode", dwigerMode ? "true" : "false");
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
    const result = await readJsonResponse<{
      error?: string;
      mode?: "original" | "dwiger";
      text?: string;
      words?: WordTiming[];
    }>(response);

    if (!response.ok) {
      setState("error");
      setStatus(result.error ?? "Transcription failed.");
      return;
    }

    setWords(result.words ?? []);
    setTranscript(result.text ?? "");
    setState("ready");
    setStatus(
      result.mode === "dwiger"
        ? `Dwiger mode generated ${result.words?.length ?? 0} Czech word timings.`
        : `Generated ${result.words?.length ?? 0} word timestamps.`,
    );
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
        width: videoDimensions.width,
        height: videoDimensions.height,
        exportFps,
        lines: captionLines,
        style: {
          preset: captionPresetId,
          fontSizePercent: captionSize,
          maxWidthPercent: captionWidth,
          bottomPercent: captionBottom,
        },
      }),
    );

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        body: formData,
      });
      const result = await readJsonResponse<{ jobId?: string; error?: string }>(response);

      if (!response.ok) {
        setState("error");
        setStatus(result.error ?? "Render failed.");
        return;
      }

      if (!result.jobId) {
        throw new Error("Render job did not return a job ID.");
      }

      const jobId = String(result.jobId);

      while (true) {
        await wait(2000);
        const statusResponse = await fetch(
          "/api/render?jobId=" + encodeURIComponent(jobId),
          { cache: "no-store" },
        );
        const job = await readJsonResponse<RenderJobStatus>(statusResponse);

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

        if (job.status === "queued") {
          setStatus(job.message ?? "Preparing video for render...");
          continue;
        }

        setStatus(
          (job.message ?? "Rendering the subtitled MP4...") +
            " " +
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
    autoDwigerFileKeyRef.current = "";
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
              <h2 className="section-title">Translation Mode</h2>
            </div>
            <label className="mode-toggle">
              <input
                type="checkbox"
                checked={dwigerMode}
                disabled={isBusy}
                onChange={(event) => setDwigerMode(event.target.checked)}
              />
              <span className="mode-switch" aria-hidden="true" />
              <span className="mode-copy">
                <strong>Dwiger mode</strong>
                <span>Rewrite subtitles into natural Czech after transcription</span>
              </span>
            </label>
          </section>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Caption Style</h2>
            </div>
            <div className="preset-picker" aria-label="Caption preset">
              {captionPresets.map((preset) => (
                <button
                  className={`preset-option ${
                    captionPresetId === preset.id ? "selected" : ""
                  }`}
                  type="button"
                  key={preset.id}
                  aria-pressed={captionPresetId === preset.id}
                  onClick={() => setCaptionPresetId(preset.id)}
                >
                  <span>{preset.name}</span>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
            <div className="overlay-setting">
              <span className="setting-label">
                <strong>Platform guide</strong>
                <span>Preview only, not exported</span>
              </span>
              <div className="overlay-picker" aria-label="Platform preview overlay">
                {previewOverlays.map((overlay) => (
                  <button
                    className={`overlay-option ${
                      previewOverlay === overlay.id ? "selected" : ""
                    }`}
                    type="button"
                    key={overlay.id}
                    aria-pressed={previewOverlay === overlay.id}
                    onClick={() => setPreviewOverlay(overlay.id)}
                  >
                    {overlay.name}
                  </button>
                ))}
              </div>
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
            <label className="setting-row setting-row-stacked">
              <span className="setting-label">
                <strong>Caption height</strong>
                <span>{captionBottom}% from bottom</span>
              </span>
              <input
                className="range-input"
                type="range"
                min="4"
                max="42"
                step="1"
                value={captionBottom}
                onChange={(event) =>
                  setCaptionBottom(Number(event.target.value))
                }
              />
            </label>
          </section>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Export Settings</h2>
            </div>
            <div className="export-setting">
              <span className="setting-label">
                <strong>Frame rate</strong>
                <span>{exportFps} FPS MP4 export</span>
              </span>
              <div className="fps-picker" aria-label="Export frame rate">
                {exportFpsOptions.map((fps) => (
                  <button
                    className={`fps-option ${exportFps === fps ? "selected" : ""}`}
                    type="button"
                    key={fps}
                    aria-pressed={exportFps === fps}
                    onClick={() => setExportFps(fps)}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
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
            <div
              className="video-wrap"
              style={
                {
                  "--video-aspect": videoDimensions.width / videoDimensions.height,
                  "--preview-progress": `${platformProgress}%`,
                } as CSSProperties
              }
            >
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls={previewOverlay === "none"}
                  onClick={togglePreviewPlayback}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setDuration(video.duration);
                    if (video.videoWidth && video.videoHeight) {
                      const dimensions = {
                        width: video.videoWidth,
                        height: video.videoHeight,
                      };
                      setVideoDimensions(dimensions);
                      if (!autoAppliedDefaultsRef.current) {
                        applyVideoDefaults(dimensions);
                        autoAppliedDefaultsRef.current = true;
                      }
                    }
                  }}
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

              {videoUrl && previewOverlay !== "none" ? (
                <PlatformOverlay type={previewOverlay} />
              ) : null}

              {activeCaption ? (
                <div
                  className="caption-overlay"
                  style={
                    {
                      "--caption-bottom": `${captionBottom}%`,
                    } as CSSProperties
                  }
                >
                  <div
                    className="caption-pill"
                    data-preset={captionPresetId}
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
