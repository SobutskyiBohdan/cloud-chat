import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex h-full w-full">
      <ChatSidebar className="hidden md:flex" />
      <ChatWindow chatId={id} />
    </div>
  );
}
