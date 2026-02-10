import { useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelpCenter } from "@/components/help-center/HelpCenterContext";

/**
 * Floating chatbot button - bottom-right corner of every client page.
 * Opens the Help Center drawer to the chatbot tab.
 */
export function FloatingChatbot() {
  const { openHelpCenter, isOpen } = useHelpCenter();

  // Don't show when help center is already open
  if (isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        onClick={() => openHelpCenter("chatbot")}
        className="h-14 w-14 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          backgroundColor: "hsl(330 86% 51%)", // brand-fuchsia
        }}
        aria-label="Open chatbot"
      >
        <Bot className="h-6 w-6 text-white" />
      </Button>
    </div>
  );
}
