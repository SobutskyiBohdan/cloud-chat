import { SocketProvider } from "@/components/providers/SocketProvider";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      <div className="h-screen flex overflow-hidden bg-background">{children}</div>
    </SocketProvider>
  );
}
