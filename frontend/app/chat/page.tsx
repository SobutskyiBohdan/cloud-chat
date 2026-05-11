import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MessageCircle } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-full w-full">
      <ChatSidebar />
      <div className="hidden md:flex flex-1 items-center justify-center bg-muted/20">
        <div className="text-center space-y-3 text-muted-foreground">
          <MessageCircle className="w-16 h-16 mx-auto opacity-30" />
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm">Choose a chat from the left to start messaging</p>
        </div>
      </div>
    </div>
  );
}
