import * as React from "react";
import { motion } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { X, Sparkles, ChevronRight } from "lucide-react";

interface QuickActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
  onScanBill?: () => void;
  onVoiceTransaction?: () => void;
  onAddTransaction?: () => void;
}

export const QuickActionsDrawer = ({
  isOpen,
  onClose,
  onNavigate,
  onScanBill,
  onVoiceTransaction,
  onAddTransaction,
}: QuickActionsDrawerProps) => {
  const handleNavigate = (tab: string) => {
    onNavigate?.(tab);
    onClose();
  };

  const handleScanBill = () => {
    onScanBill?.();
    onClose();
  };

  const handleVoiceTransaction = () => {
    onVoiceTransaction?.();
    onClose();
  };

  const handleAddTransaction = () => {
    onAddTransaction?.();
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[90vh] border-t-white/10 shadow-pro overflow-hidden glass-card-pro transition-all duration-500 rounded-t-[3rem]">
        {/* Drag Handle */}
        <div className="mx-auto w-12 h-1.5 bg-muted/40 rounded-full mt-3 mb-1" />
        
        <div className="absolute top-4 right-4 z-50">
          <DrawerClose asChild>
            <button className="w-10 h-10 rounded-full bg-secondary/80 flex items-center justify-center hover:bg-muted transition-all active:scale-90 border border-border/50 backdrop-blur-md">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </DrawerClose>
        </div>

        <div className="mx-auto w-full max-w-lg px-6 pt-2 pb-12 overflow-y-auto scrollbar-hide">
          <DrawerHeader className="px-0 pt-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shadow-glow">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="text-left">
                <DrawerTitle className="text-2xl font-black tracking-tight text-foreground">Action Hub</DrawerTitle>
                <DrawerDescription className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Experience Financial Mastery
                </DrawerDescription>
              </div>
            </div>
          </DrawerHeader>

          <div className="mt-2">
            <QuickActionsGrid
              variant="drawer"
              onNavigate={handleNavigate}
              onScanBill={handleScanBill}
              onVoiceTransaction={handleVoiceTransaction}
              onAddTransaction={handleAddTransaction}
            />
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-5 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-between group cursor-pointer hover:from-primary/15 hover:to-accent/15 transition-all shadow-lg active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[1.25rem] bg-background/50 flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">A.I. Financial Assistant</p>
                <p className="text-[11px] text-muted-foreground font-medium">Ask for insights, trends, or help</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <ChevronRight className="w-4 h-4 text-primary" />
            </div>
          </motion.div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
