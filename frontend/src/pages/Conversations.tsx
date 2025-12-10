import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
    Search,
    Star,
    MessageSquare,
    Send,
    ChevronDown,
    ChevronUp,
    User
} from 'lucide-react'
import {
    getConversations,
    getConversationMessages,
    sendReply,
    updateConversation
} from '@/lib/api'
import type { Conversation, Message } from '@/lib/types'
import { PageLayout } from '@/components/PageLayout'

export function Conversations() {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({
        unreadOnly: false,
        vipOnly: false,
        priority: '',
    })
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [messagesLoading, setMessagesLoading] = useState(false)
    const [replyText, setReplyText] = useState('')
    const [sending, setSending] = useState(false)

    const loadConversations = useCallback(async () => {
        try {
            const result = await getConversations({
                search: search || undefined,
                unread_only: filters.unreadOnly || undefined,
                is_vip: filters.vipOnly || undefined,
                priority: filters.priority || undefined,
                limit: 100,
            })
            setConversations(result.conversations)
        } catch (e) {
            console.error('Failed to load conversations:', e)
        } finally {
            setLoading(false)
        }
    }, [search, filters])

    useEffect(() => {
        const timer = setTimeout(() => {
            loadConversations()
        }, 300)
        return () => clearTimeout(timer)
    }, [loadConversations])

    const handleExpand = async (uuid: string) => {
        if (expandedId === uuid) {
            setExpandedId(null)
            return
        }

        setExpandedId(uuid)
        setMessagesLoading(true)
        setMessages([])
        setReplyText('')

        try {
            const result = await getConversationMessages(uuid, 20)
            setMessages(result.messages.reverse())
        } catch (e) {
            console.error('Failed to load messages:', e)
        } finally {
            setMessagesLoading(false)
        }
    }

    const handleReply = async (uuid: string) => {
        if (!replyText.trim()) return

        setSending(true)
        try {
            await sendReply(uuid, replyText)
            setReplyText('')
            // Reload messages
            const result = await getConversationMessages(uuid, 20)
            setMessages(result.messages.reverse())
        } catch (e) {
            console.error('Failed to send reply:', e)
        } finally {
            setSending(false)
        }
    }

    const handleToggleVip = async (conv: Conversation) => {
        try {
            await updateConversation(conv.uuid, { is_vip: !conv.is_vip })
            loadConversations()
        } catch (e) {
            console.error('Failed to update:', e)
        }
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <PageLayout variant="full">
            {/* Filters */}
            <div className="border-b p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search conversations..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button
                        variant={filters.unreadOnly ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilters(f => ({ ...f, unreadOnly: !f.unreadOnly }))}
                    >
                        Unread
                    </Button>
                    <Button
                        variant={filters.vipOnly ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilters(f => ({ ...f, vipOnly: !f.vipOnly }))}
                    >
                        <Star className="h-4 w-4 mr-1" />
                        VIP
                    </Button>
                </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full" />
                        ))
                    ) : conversations.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                            <p>No conversations found</p>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div key={conv.uuid} className="rounded-lg border bg-card overflow-hidden">
                                {/* Header */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => handleExpand(conv.uuid)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                                <User className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {conv.display_name}
                                                    {conv.is_vip && (
                                                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                                    )}
                                                </div>
                                                {conv.username && (
                                                    <div className="text-sm text-muted-foreground">@{conv.username}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {conv.unread_count > 0 && (
                                                <Badge variant="default">{conv.unread_count}</Badge>
                                            )}
                                            {conv.priority === 'high' && (
                                                <Badge variant="destructive">High</Badge>
                                            )}
                                            {expandedId === conv.uuid ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </div>
                                    {conv.last_message_preview && (
                                        <p className="mt-2 text-sm text-muted-foreground truncate">
                                            {conv.last_message_preview}
                                        </p>
                                    )}
                                </div>

                                {/* Expanded Content */}
                                {expandedId === conv.uuid && (
                                    <div className="border-t">
                                        {/* Messages */}
                                        <div className="max-h-64 overflow-y-auto p-4 bg-muted/30 space-y-2">
                                            {messagesLoading ? (
                                                <div className="text-center text-sm text-muted-foreground py-4">
                                                    Loading messages...
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
                                                            <span>{formatDate(msg.date)}</span>
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
                                            />
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleReply(conv.uuid)}
                                                    disabled={!replyText.trim() || sending}
                                                >
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleToggleVip(conv)}
                                                >
                                                    <Star className={`h-4 w-4 ${conv.is_vip ? 'fill-amber-500 text-amber-500' : ''}`} />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </PageLayout>
    )
}
