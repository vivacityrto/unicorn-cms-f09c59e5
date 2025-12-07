import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { cn } from '@/lib/utils';
import { CheckCircle2, ClipboardList } from 'lucide-react';
interface AnimatedTab {
  value: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  details?: string;
}
interface AnimatedTabsProps {
  tabs: AnimatedTab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}
export function AnimatedTabs({
  tabs,
  value,
  onValueChange,
  className
}: AnimatedTabsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AnimatedTab | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const variants = prefersReducedMotion ? {
    initial: {},
    animate: {},
    exit: {}
  } : {
    initial: {
      opacity: 0,
      y: 10
    },
    animate: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -10
    }
  };
  return <Tabs value={value} onValueChange={onValueChange} className={cn("w-full", className)}>
      <div className="relative w-full mb-6">
        <div className="w-full overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex h-auto w-full min-w-max lg:w-full lg:min-w-full justify-between lg:justify-between gap-2 bg-transparent p-0">
            {tabs.map((tab, index) => <div key={tab.value} className="group relative flex flex-col items-center gap-2">
                <div className="relative">
                  <button className="opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all duration-300 ease-out text-xs px-4 py-2 rounded-lg bg-card text-card-foreground font-medium shadow-lg hover:shadow-xl border border-border relative before:content-[''] before:absolute before:bottom-[-6px] before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-card before:opacity-0 before:group-hover:opacity-100 before:transition-opacity before:duration-300" onClick={e => {
                e.stopPropagation();
                setSelectedTab(tab);
                setDialogOpen(true);
              }}>
                    View More
                  </button>
                </div>
                <TabsTrigger value={tab.value} className={cn("relative items-center justify-center rounded-lg border transition-all duration-300", "px-2 sm:px-3 py-3 min-w-[100px] sm:min-w-[110px]", "text-xs sm:text-sm font-semibold", "text-muted-foreground bg-background border-border", "hover:text-foreground hover:bg-muted/50 hover:border-border", "data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", "disabled:pointer-events-none disabled:opacity-50", "whitespace-nowrap shadow-sm")}>
                  <motion.div className="relative z-10" initial={false} animate={value === tab.value ? {
                scale: 1.02
              } : {
                scale: 1
              }} transition={{
                duration: 0.2,
                ease: "easeOut"
              }}>
                    <span className="font-semibold">{tab.label}</span>
                  </motion.div>
                </TabsTrigger>
              </div>)}
          </TabsList>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tabs.map(tab => tab.value === value && tab.content && <TabsContent key={tab.value} value={tab.value} asChild className="mt-0">
              <motion.div initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={{
          duration: prefersReducedMotion ? 0 : 0.3,
          ease: [0.25, 0.1, 0.25, 1]
        }}>
                {tab.content}
              </motion.div>
            </TabsContent>)}
      </AnimatePresence>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[520px] max-w-[90vw] bg-gradient-to-br from-background to-muted/20 border-[3px] border-[#dfdfdf]">
          <DialogHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                {selectedTab?.label}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground m-0 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Package Details
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="mt-6 space-y-6 max-h-[60vh] overflow-y-auto pr-2">
            {selectedTab && selectedTab.details ? <div className="space-y-4">
                {(() => {
              const details = selectedTab.details || '';
              const parts = details.split('Membership gives them ');
              const description = parts[0].trim();
              const includes = parts[1] || '';
              return <>
                      <div className="p-4 rounded-lg border border-border/50" style={{
                  backgroundColor: '#3b82f60d'
                }}>
                        <p className="text-sm text-foreground whitespace-pre-wrap" style={{ lineHeight: '25px' }}>
                          {description}
                        </p>
                      </div>
                      
                      {includes && <div className="space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                            
                          </div>
                          <div className="grid gap-3" style={{ paddingLeft: '5px' }}>
                            {(() => {
                      // Parse the includes text into structured items
                      const text = includes;
                      const items: string[] = [];

                      // Extract hours
                      const hoursMatch = text.match(/(\d+)\s*hours/i);
                      if (hoursMatch) {
                        items.push(`${hoursMatch[1]} hours of Vivacity support (valid for 12 months)`);
                      }

                      // Check for consult time
                      if (text.toLowerCase().includes('consult time') || text.toLowerCase().includes('client success champion')) {
                        items.push('Consult time with a Client Success Champion');
                      }

                      // Check for VIV training
                      if (text.toLowerCase().includes('viv training')) {
                        items.push('Access to VIV Training');
                      }

                      // Check for UNICORN docs
                      if (text.toLowerCase().includes('unicorn docs')) {
                        items.push('Access to all UNICORN documents');
                      }

                      return items.map((item, i) => <div key={i} className="flex items-start gap-3">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                    <span className="text-sm text-muted-foreground leading-relaxed">
                                      {item}
                                    </span>
                                  </div>);
                    })()}
                          </div>
                        </div>}
                    </>;
            })()}
              </div> : <div className="p-4 text-center text-sm text-muted-foreground">
                No details available for this package.
              </div>}
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>;
}