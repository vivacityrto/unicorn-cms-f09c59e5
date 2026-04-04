import { cn } from "@/lib/utils";

interface VideoThumbnailProps {
  src?: string | null;
  videoName: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-16 w-24",
  md: "h-24 w-36",
  lg: "h-40 w-full",
};

export default function VideoThumbnail({ src, videoName, size = "md" }: VideoThumbnailProps) {
  const dims = sizeMap[size];

  if (src) {
    return (
      <img
        src={src}
        alt={videoName}
        className={cn("rounded-lg object-cover flex-shrink-0", dims)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center flex-shrink-0",
        dims
      )}
      style={{
        background: "linear-gradient(135deg, hsl(270 55% 41%) 0%, hsl(330 86% 51%) 100%)",
      }}
    >
      <span className="text-white font-bold text-2xl select-none" style={{ fontFamily: "'Anton', sans-serif" }}>
        {videoName.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
