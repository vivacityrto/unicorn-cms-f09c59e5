import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, MessageCircle, Headphones } from "lucide-react";
import { useHelpCenter, type HelpCenterTab } from "./HelpCenterContext";
import { ChatTab } from "./ChatTab";
import { MessageTab } from "./MessageTab";

export function HelpCenterDrawer() {
  const { isOpen, activeTab, closeHelpCenter, setActiveTab } = useHelpCenter();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeHelpCenter()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[420px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="text-secondary">Help Center</SheetTitle>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as HelpCenterTab)}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="mx-4 mt-2 grid grid-cols-3">
            <TabsTrigger value="chatbot" className="gap-1 text-xs">
              <Bot className="h-3.5 w-3.5" />
              Chatbot
            </TabsTrigger>
            <TabsTrigger value="csc" className="gap-1 text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              CSC
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-1 text-xs">
              <Headphones className="h-3.5 w-3.5" />
              Support
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chatbot" className="flex-1 min-h-0 mt-0">
            <ChatTab />
          </TabsContent>
          <TabsContent value="csc" className="flex-1 min-h-0 mt-0">
            <MessageTab channel="csc" />
          </TabsContent>
          <TabsContent value="support" className="flex-1 min-h-0 mt-0">
            <MessageTab channel="support" />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
