import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react'
import { getConversationMessages, sendReply } from '@/lib/api'
import type { ReportItem, Message } from '@/lib/types'

interface ReportItemCardProps {
    item: ReportItem
    urgency: 'high' | 'medium' | 'low'
}

export function ReportItemCard({ item, urgency }: ReportItemCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [messagesLoading, setMessagesLoading] = useState(false)
    const [replyText, setReplyText] = useState('')
    const [sending, setSending] = useState(false)

    const badgeVariant = urgency === 'high' ? 'destructive' : urgency === 'medium' ? 'warning' : 'success'

    const handleToggle = async () => {
        if (!expanded) {
            // Expanding - fetch messages
            setExpanded(true)
            setMessagesLoading(true)
            try {
                const result = await getConversationMessages(item.conversation_uuid, 20)
                setMessages(result.messages.reverse())
            } catch (e) {
                console.error('Failed to load messages:', e)
            } finally {
                setMessagesLoading(false)
            }
        } else {
            // Collapsing
            setExpanded(false)
        }
    }

    const handleReply = async () => {
        if (!replyText.trim()) return

        setSending(true)
        try {
            await sendReply(item.conversation_uuid, replyText)
            setReplyText('')
            // Reload messages
            const result = await getConversationMessages(item.conversation_uuid, 20)
            setMessages(result.messages.reverse())
        } catch (e) {
            console.error('Failed to send reply:', e)
        } finally {
            setSending(false)
        }
    }

    const formatTime = (date: string) => {
        return new Date(date).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            {/* Header - clickable */}
            <div
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={handleToggle}
            >
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                            {item.display_name}
                            {expanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </div>
                        {item.username && (
                            <div className="text-sm text-muted-foreground">@{item.username}</div>
                        )}
                    </div>
                    <Badge variant={badgeVariant}>{item.urgency_score}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                {item.reasoning && (
                    <p className="mt-1 text-xs italic text-muted-foreground">{item.reasoning}</p>
                )}
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="border-t">
                    {/* Messages */}
                    <div className="max-h-64 overflow-y-auto p-4 bg-muted/30 space-y-2">
                        {messagesLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-4">
                                No cached messages. Try syncing.
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className="rounded bg-background p-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="font-medium text-primary">
                                            {msg.sender_name || 'Unknown'}
                                        </span>
                                        <span>{formatTime(msg.date)}</span>
                                    </div>
                                    <p className="mt-1 text-sm">{msg.text || '[Media]'}</p>
                                </div>
                            ))
                        )}
                    </div>

                    <Separator />

                    {/* Reply */}
                    <div className="p-4 flex gap-2">
                        <Textarea
                            placeholder="Type a reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            className="flex-1 min-h-[60px]"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    handleReply()
                                }
                            }}
                        />
                        <Button
                            size="sm"
                            onClick={handleReply}
                            disabled={!replyText.trim() || sending}
                        >
                            {sending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
