"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Plus,
  Search,
  Send,
  Share2,
  Upload,
} from "lucide-react";
import {
  defaultCaptionSettings,
  fitSingleLineFontSize,
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

type VideoSource = {
  uploadId: string;
  name: string;
  type: string;
  size: number;
};

async function uploadVideoFile(file: File): Promise<VideoSource> {
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await readJsonResponse<{
    uploadId?: string;
    name?: string;
    type?: string;
    size?: number;
    error?: string;
  }>(response);

  if (!response.ok || !result.uploadId) {
    throw new Error(result.error ?? "Could not upload the video.");
  }

  return {
    uploadId: result.uploadId,
    name: result.name ?? file.name,
    type: result.type ?? file.type ?? "application/octet-stream",
    size: result.size ?? file.size,
  };
}

function downloadRenderedVideo(url: string, sourceName: string) {
  const baseName = sourceName.replace(/\.[^.]+$/, "") || "video";
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}-subtitled.mp4`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const defaultVideoDimensions: VideoDimensions = {
  width: 1280,
  height: 720,
};

const previewOverlays: { id: PreviewOverlay; name: string }[] = [
  { id: "none", name: "None" },
  { id: "tiktok", name: "TikTok" },
  { id: "instagram", name: "Instagram" },
];

const verticalVideoDefaults: VideoDefaults = {
  previewOverlay: "tiktok",
  maxWordsPerLine: defaultCaptionSettings.maxWordsPerLine,
  maxLineDuration: defaultCaptionSettings.maxLineDuration,
  captionSize: 6,
  captionWidth: 88,
  captionBottom: 28,
  exportFps: 30,
};

const horizontalVideoDefaults: VideoDefaults = {
  previewOverlay: "none",
  maxWordsPerLine: defaultCaptionSettings.maxWordsPerLine,
  maxLineDuration: defaultCaptionSettings.maxLineDuration,
  captionSize: 6,
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

function isFileAccessError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return /requested file could not be read|permission|not readable/i.test(error.message);
}

function PlatformOverlay({
  type,
  currentTime,
  duration,
  onSeek,
}: {
  type: Exclude<PreviewOverlay, "none">;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const timeline = (
    <input
      aria-label="Video timeline"
      className="platform-progress"
      type="range"
      min={0}
      max={duration || 0}
      step="0.01"
      value={Math.min(currentTime, duration || 0)}
      disabled={!duration}
      onChange={(event) => onSeek(Number(event.currentTarget.value))}
      onClick={(event) => event.stopPropagation()}
    />
  );

  if (type === "instagram") {
    return (
      <div className="platform-overlay instagram-overlay">
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
        {timeline}
      </div>
    );
  }

  return (
    <div className="platform-overlay tiktok-overlay">
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
      {timeline}
    </div>
  );
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlPanelRef = useRef<HTMLDivElement>(null);
  const captionListRef = useRef<HTMLDivElement>(null);
  const captionRowRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const autoDwigerFileKeyRef = useRef("");
  const autoAppliedDefaultsRef = useRef(false);
  const transcribeInFlightRef = useRef(false);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions>(
    defaultVideoDimensions,
  );
  const [duration, setDuration] = useState(0);
  const [words, setWords] = useState<WordTiming[]>([]);
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
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState(-1);
  const [previewOverlay, setPreviewOverlay] =
    useState<PreviewOverlay>(verticalVideoDefaults.previewOverlay);
  const [dwigerMode, setDwigerMode] = useState(false);
  const [exportFps, setExportFps] = useState<ExportFps>(verticalVideoDefaults.exportFps);
  const [state, setState] = useState<JobState>("idle");
  const [status, setStatus] = useState("Drop in a clip to start.");
  const [renderUrl, setRenderUrl] = useState("");
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [wizardDirection, setWizardDirection] = useState<"forward" | "back">(
    "forward",
  );

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
  const activeCaptionIndex = activeCaption
    ? captionLines.findIndex((line) => line.id === activeCaption.id)
    : -1;
  const highlightedCaptionIndex =
    activeCaptionIndex >= 0 ? activeCaptionIndex : selectedCaptionIndex;
  const fittedCaptionSize = activeCaption
    ? fitSingleLineFontSize(activeCaption.words, captionSize, captionWidth)
    : captionSize;
  const isBusy = state === "transcribing" || state === "rendering";
  const hasCaptions = captionLines.length > 0;
  const canRender = Boolean(videoSource && captionLines.length && duration) && !isBusy;
  const visibleStatus = /generated \d+ (?:\w+ )?word (?:timestamps|timings)/i.test(
    status,
  )
    ? ""
    : status;
  const platformProgress = duration
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    controlPanelRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [wizardStep]);

  useEffect(() => {
    if (highlightedCaptionIndex < 0) return;

    const list = captionListRef.current;
    const row = captionRowRefs.current[highlightedCaptionIndex];
    if (!list || !row) return;

    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowIsVisible =
      rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom;

    if (!rowIsVisible) {
      list.scrollTo({
        top:
          list.scrollTop +
          rowRect.top -
          listRect.top -
          (list.clientHeight - rowRect.height) / 2,
        behavior: "smooth",
      });
    }
  }, [highlightedCaptionIndex]);

  useEffect(() => {
    if (activeCaptionIndex >= 0) {
      setSelectedCaptionIndex(activeCaptionIndex);
    }
  }, [activeCaptionIndex]);

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

  async function loadVideoFile(file: File) {
    if (!isVideoFile(file)) {
      setState("error");
      setStatus("Drop a video file, like MP4, MOV, or WebM.");
      return;
    }

    const shouldPreserveCaptions = words.length > 0;
    setState("idle");
    setStatus(
      shouldPreserveCaptions
        ? "Uploading video without changing captions..."
        : "Uploading video...",
    );

    let nextVideoSource: VideoSource;
    try {
      nextVideoSource = await uploadVideoFile(file);
    } catch (error) {
      setState("error");
      setStatus(
        isFileAccessError(error)
          ? "The selected video could not be uploaded. Try copying it to a local folder and selecting it again."
          : error instanceof Error
            ? error.message
            : "The selected video could not be uploaded.",
      );
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoSource(nextVideoSource);
    setVideoUrl(URL.createObjectURL(file));
    setRenderUrl("");
    setState("idle");
    setWizardDirection("forward");
    setWizardStep(1);

    if (shouldPreserveCaptions) {
      autoAppliedDefaultsRef.current = true;
      autoDwigerFileKeyRef.current = nextVideoSource.uploadId;
      setStatus(nextVideoSource.name + " reconnected. Your edited captions were preserved.");
      return;
    }

    setVideoDimensions(defaultVideoDimensions);
    autoAppliedDefaultsRef.current = false;
    autoDwigerFileKeyRef.current = "";
    setDuration(0);
    setWords([]);
    setCurrentTime(0);
    setStatus(
      dwigerMode
        ? nextVideoSource.name + " is ready. Starting Dwiger mode..."
        : nextVideoSource.name + " uploaded. Starting transcription...",
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await loadVideoFile(file);
    } finally {
      event.target.value = "";
    }
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

  function seekPreview(time: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(time)) return;

    const nextTime = Math.min(Math.max(time, 0), video.duration || duration || 0);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
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

  async function handleVideoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingVideo(false);

    if (isBusy) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    await loadVideoFile(file);
  }

  const transcribeVideo = useCallback(async () => {
    if (!videoSource || transcribeInFlightRef.current) return;

    transcribeInFlightRef.current = true;
    setState("transcribing");
    setStatus(
      dwigerMode
        ? "Extracting audio, transcribing, and rewriting subtitles into Czech..."
        : "Extracting audio and generating word timestamps...",
    );
    setRenderUrl("");

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          uploadId: videoSource.uploadId,
          name: videoSource.name,
          dwigerMode,
        }),
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
      setState("ready");
      setStatus("");
    } catch (error) {
      setState("error");
      setStatus(
        isFileAccessError(error)
          ? "The browser lost access to the selected video before it could be copied. Select the video again; existing captions will be preserved."
          : error instanceof Error
            ? error.message
            : "Transcription failed.",
      );
    } finally {
      transcribeInFlightRef.current = false;
    }
  }, [dwigerMode, videoSource]);

  useEffect(() => {
    if (!videoSource || isBusy) return;

    const fileKey = videoSource.uploadId;
    if (autoDwigerFileKeyRef.current === fileKey) return;

    autoDwigerFileKeyRef.current = fileKey;
    void transcribeVideo();
  }, [videoSource, isBusy, transcribeVideo]);

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

      return nextWords;
    });

    setRenderUrl("");
    if (state === "rendered" || state === "error") {
      setState("ready");
    }
    setStatus("");
  }

  async function renderVideo() {
    if (!videoSource || !captionLines.length || !duration) return;

    setState("rendering");
    setStatus("Starting render...");

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          uploadId: videoSource.uploadId,
          name: videoSource.name,
          payload: {
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
          },
        }),
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
          setStatus("Render complete. Download started automatically.");
          downloadRenderedVideo(job.url, videoSource.name);
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
      setStatus(
        isFileAccessError(error)
          ? "The browser lost access to the selected video before it could be copied. Select the video again; existing captions will be preserved."
          : error instanceof Error
            ? error.message
            : "Render failed.",
      );
    }
  }

  function handleWorkspaceWheel(event: WheelEvent<HTMLDivElement>) {
    if (window.innerWidth <= 960) return;

    const controlPanel = controlPanelRef.current;
    if (!controlPanel || controlPanel.contains(event.target as Node)) return;

    event.preventDefault();
    controlPanel.scrollBy({
      top: event.deltaY,
      left: event.deltaX,
      behavior: "auto",
    });
  }

  const canGoForward =
    wizardStep === 0 ? Boolean(videoSource) : wizardStep === 1 ? hasCaptions : false;

  function goBack() {
    setWizardDirection("back");
    setWizardStep((current) => (current === 2 ? 1 : 0));
  }

  function goForward() {
    setWizardDirection("forward");
    setWizardStep((current) => (current === 0 ? 1 : 2));
  }

  return (
    <main className="app-shell">
      <div className="workspace" onWheel={handleWorkspaceWheel}>
        <aside className="control-panel">
          <div className="wizard-progress" aria-label={`Step ${wizardStep + 1} of 3`}>
            {[0, 1, 2].map((step) => (
              <span className={step <= wizardStep ? "active" : ""} key={step} />
            ))}
          </div>
          <div className="wizard-content" ref={controlPanelRef}>
          <div
            className={`wizard-page wizard-page-${wizardDirection}`}
            key={wizardStep}
          >
          {wizardStep === 0 ? (
            <>
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
                    : videoSource
                      ? videoSource.name
                      : "Upload video"}
                </p>
                <p className="drop-meta">Click or drag in MP4, MOV, or WebM</p>
              </div>
            </div>
          </label>

          <section className="section">
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
            </>
          ) : null}

          {wizardStep === 1 ? (
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
                </button>
              ))}
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
                min="0.3"
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
                max="10"
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
          ) : null}

          {wizardStep === 2 ? (
            <>
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Social Overlay</h2>
              </div>
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
            </section>

            {editableCaptionLines.length ? (
              <section className="section caption-editor">
                <h2 className="section-title">Caption Editor</h2>
                <div className="caption-edit-list" ref={captionListRef}>
                  {editableCaptionLines.map((line, index) => (
                    <label
                      className={`caption-edit-row ${
                        index === highlightedCaptionIndex ? "active" : ""
                      }`}
                      aria-current={
                        index === highlightedCaptionIndex ? "true" : undefined
                      }
                      key={line.id + "-" + line.start + "-" + line.end + "-" + line.text}
                      ref={(element) => {
                        captionRowRefs.current[index] = element;
                      }}
                      onClick={() => {
                        setSelectedCaptionIndex(index);
                        seekPreview(line.start);
                      }}
                    >
                      <span className="caption-time">
                        {formatTimestamp(line.start)} - {formatTimestamp(line.end)}
                      </span>
                      <input
                        className="caption-input"
                        type="text"
                        defaultValue={line.text}
                        disabled={isBusy}
                        spellCheck
                        onBlur={(event) =>
                          updateCaptionLine(line, event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={renderVideo}
                disabled={!canRender}
              >
                <Film size={18} />
                {state === "rendering" ? "Rendering…" : "Render"}
              </button>
            </div>

            {renderUrl ? (
              <a className="download-link" href={renderUrl} download>
                <Download size={18} />
                Download MP4
              </a>
            ) : null}
            </>
          ) : null}

          {visibleStatus ? (
            <div className={`status-row ${state === "error" ? "error" : ""}`}>
              {isBusy ? <span className="spinner" /> : null}
              <span>{visibleStatus}</span>
            </div>
          ) : null}
          </div>
          </div>

          <nav className="wizard-nav" aria-label="Wizard navigation">
            {wizardStep > 0 ? (
              <button
                className="wizard-arrow"
                type="button"
                onClick={goBack}
                disabled={state === "rendering"}
                aria-label="Previous step"
              >
                <ChevronLeft size={22} />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <span>Step {wizardStep + 1} of 3</span>
            {wizardStep < 2 ? (
              <button
                className="wizard-arrow wizard-arrow-next"
                type="button"
                onClick={goForward}
                disabled={!canGoForward || state === "rendering"}
                aria-label="Next step"
              >
                <ChevronRight size={22} />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
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
                    <span className="empty-preview-icon">
                      <Film size={28} strokeWidth={1.8} />
                    </span>
                    <strong>Your preview appears here</strong>
                    <p>Upload a video to start creating captions.</p>
                  </div>
                </div>
              )}

              {videoUrl && previewOverlay !== "none" ? (
                <PlatformOverlay
                  type={previewOverlay}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={seekPreview}
                />
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
                        "--caption-size": fittedCaptionSize,
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
