import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating scroll-to-top button that listens to window scroll.
 * Positioned at bottom-20 right-6 to clear the Ask Viv launcher at bottom-6.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      aria-label="Scroll to top"
      className={cn(
        "fixed bottom-20 right-6 z-40 rounded-full shadow-md transition-opacity duration-300 h-9 w-9 p-0",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ChevronUp className="h-4 w-4" />
    </Button>
  );
}
