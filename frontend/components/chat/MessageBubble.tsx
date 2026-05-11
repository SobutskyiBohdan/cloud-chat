import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  userId: string;
  createdAt: string;
  user: { id: string; name: string; nickname: string | null; avatarUrl: string | null };
}

interface Props {
  message: Message;
  isOwn: boolean;
  onUserClick?: (userId: string) => void;
}

export function MessageBubble({ message, isOwn, onUserClick }: Props) {
  const displayName = message.user.nickname ? `@${message.user.nickname}` : message.user.name;
  const time = new Date(message.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={cn("flex gap-2 items-end mb-2", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <button
          onClick={() => onUserClick?.(message.userId)}
          className="shrink-0 mb-1 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={message.user.avatarUrl || ""} />
            <AvatarFallback className="text-xs">{message.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      )}
      <div className={cn("max-w-[70%] space-y-1", isOwn && "items-end")}>
        {!isOwn && (
          <button
            onClick={() => onUserClick?.(message.userId)}
            className="text-xs text-muted-foreground px-1 hover:text-foreground transition-colors"
          >
            {displayName}
          </button>
        )}
        <div className={cn(
          "rounded-2xl px-3 py-2 text-sm break-words",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm"
        )}>
          {message.mediaUrl && (
            <div className="mb-2 rounded-lg overflow-hidden">
              <Image src={message.mediaUrl} alt="media" width={300} height={200} className="object-cover" />
            </div>
          )}
          <p>{message.content}</p>
          <p className={cn("text-xs mt-1", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}
