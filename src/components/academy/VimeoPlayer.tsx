import { useEffect, useRef, useState } from "react";
import Player from "@vimeo/player";
import { AlertTriangle, Play } from "lucide-react";

export interface VimeoPlayerProps {
  /** Raw Vimeo URL from training_videos.vimeo_url. */
  vimeoUrl: string | null | undefined;
  /** Lesson title (used for iframe a11y). */
  title?: string;
  /** Resume position in seconds (only seeks when > 5). */
  startPositionSeconds?: number;
  /**
   * Start of the lesson's segment within a longer recording (workshop splits).
   * When set, playback starts here (unless a later resume position exists) and
   * progress/completion are measured across the segment, not the whole video.
   */
  segmentStartSeconds?: number | null;
  /** End of the lesson's segment within a longer recording. */
  segmentEndSeconds?: number | null;
  /** Auto-fire onCompletionThresholdReached when percent >= this (default 90). */
  completionThreshold?: number;
  /** Fired once on first play. */
  onFirstPlay?: () => void;
  /** Fired throttled while watching. */
  onProgress?: (p: { percentInt: number; seconds: number }) => void;
  /** Fired once when Vimeo emits 'ended'. */
  onEnded?: () => void;
  /** Fired once when percent crosses completionThreshold. */
  onCompletionThresholdReached?: () => void;
  /** Throttle window for onProgress emission (ms). Default 10s. */
  progressThrottleMs?: number;
}

/**
 * Convert a Vimeo URL into a player.vimeo.com embed URL.
 * Supports privacy hashes provided either in the path
 * (`vimeo.com/<id>/<hash>`) or as a query parameter
 * (`vimeo.com/<id>?h=<hash>`).
 */
export function buildVimeoEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  let id: string | undefined;
  let hash: string | undefined;

  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    id = segments[0];
    hash = segments[1] ?? parsed.searchParams.get("h") ?? undefined;
  } catch {
    return null;
  }

  if (!id) return null;

  const params = new URLSearchParams();
  if (hash) params.set("h", hash);
  params.set("autoplay", "0");
  params.set("title", "0");
  params.set("byline", "0");
  params.set("portrait", "0");
  params.set("texttrack", "en");

  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

/**
 * Reusable Vimeo embed used across the standalone Academy and the
 * Client-Portal embedded Academy. Behaviour is preserved 1:1 from
 * the original AcademyLessonViewerPage implementation.
 */
export default function VimeoPlayer({
  vimeoUrl,
  title,
  startPositionSeconds = 0,
  segmentStartSeconds = null,
  segmentEndSeconds = null,
  completionThreshold = 90,
  onFirstPlay,
  onProgress,
  onEnded,
  onCompletionThresholdReached,
  progressThrottleMs = 10_000,
}: VimeoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const lastEmitRef = useRef<number>(0);
  const thresholdReachedRef = useRef<boolean>(false);
  const [videoError, setVideoError] = useState(false);

  const embedUrl = buildVimeoEmbedUrl(vimeoUrl ?? null);

  useEffect(() => {
    if (!embedUrl || !iframeRef.current) return;
    setVideoError(false);
    thresholdReachedRef.current = false;
    lastEmitRef.current = 0;

    const player = new Player(iframeRef.current);
    playerRef.current = player;

    const segStart = segmentStartSeconds != null && segmentStartSeconds > 0 ? segmentStartSeconds : 0;
    const segEnd =
      segmentEndSeconds != null && segmentEndSeconds > segStart ? segmentEndSeconds : null;

    const resumeAt =
      startPositionSeconds > 5 && startPositionSeconds > segStart ? startPositionSeconds : segStart;
    if (resumeAt > 0) {
      player.setCurrentTime(resumeAt).catch(() => {});
    }

    let started = false;
    const handlePlay = () => {
      if (started) return;
      started = true;
      onFirstPlay?.();
    };

    const handleTimeUpdate = (e: { seconds: number; percent: number; duration: number }) => {
      const seconds = Math.floor(e.seconds);
      let percentInt = Math.floor(e.percent * 100);

      if (segEnd) {
        const span = segEnd - segStart;
        percentInt = Math.min(100, Math.max(0, Math.floor(((e.seconds - segStart) / span) * 100)));
        if (e.seconds >= segEnd) {
          player.pause().catch(() => {});
          if (!thresholdReachedRef.current) {
            thresholdReachedRef.current = true;
            onCompletionThresholdReached?.();
          }
          onEnded?.();
          return;
        }
      }

      const now = Date.now();
      if (onProgress && now - lastEmitRef.current >= progressThrottleMs) {
        lastEmitRef.current = now;
        onProgress({ percentInt, seconds });
      }

      if (
        !thresholdReachedRef.current &&
        percentInt >= completionThreshold
      ) {
        thresholdReachedRef.current = true;
        onCompletionThresholdReached?.();
      }
    };

    const handleEnded = () => onEnded?.();
    const handleError = () => setVideoError(true);

    player.on("play", handlePlay);
    player.on("timeupdate", handleTimeUpdate);
    player.on("ended", handleEnded);
    player.on("error", handleError);

    return () => {
      player.off("play", handlePlay);
      player.off("timeupdate", handleTimeUpdate);
      player.off("ended", handleEnded);
      player.off("error", handleError);
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, segmentStartSeconds, segmentEndSeconds]);

  if (!embedUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          height: 300,
          background: "linear-gradient(135deg, #23c0dd 0%, #7130A0 100%)",
        }}
      >
        <div className="text-center text-white">
          <Play className="h-12 w-12 mx-auto mb-2 opacity-60" />
          <p className="text-sm opacity-80">Video not yet available</p>
        </div>
      </div>
    );
  }

  if (videoError) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed bg-muted/30"
        style={{ height: 300 }}
      >
        <div className="text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Video unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again or contact support.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden shadow-sm"
      style={{ paddingBottom: "56.25%", background: "#000" }}
    >
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className="absolute inset-0 w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title={title ?? "Lesson video"}
      />
    </div>
  );
}
