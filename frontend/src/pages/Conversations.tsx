import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Search,
    Tag,
    MessageSquare,
    Send,
    ChevronDown,
    ChevronUp,
    User,
    Plus
} from 'lucide-react'
import {
    getConversations,
    getConversationMessages,
    sendReply,
    updateConversation,
    getConversationTags,
    batchAddTag
} from '@/lib/api'
import type { Conversation, Message } from '@/lib/types'
import { PageLayout } from '@/components/PageLayout'
import { TagsEditor, TagsBadges } from '@/components/TagsEditor'

const PRIORITY_OPTIONS = ['High', 'Medium', 'Low']

export function Conversations() {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [allConversations, setAllConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({
        unreadOnly: false,
        tag: '',
        priority: '',
    })
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [messagesLoading, setMessagesLoading] = useState(false)
    const [replyText, setReplyText] = useState('')
    const [sending, setSending] = useState(false)
    const [tagSuggestions, setTagSuggestions] = useState<string[]>([])

    // Bulk add state
    const [showBulkAddDialog, setShowBulkAddDialog] = useState(false)
    const [bulkSearch, setBulkSearch] = useState('')
    const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set())

    // Load tag suggestions
    useEffect(() => {
        getConversationTags().then(result => {
            setTagSuggestions(result.tags)
        }).catch(() => { })
    }, [])

    const loadConversations = useCallback(async () => {
        try {
            const result = await getConversations({
                search: search || undefined,
                unread_only: filters.unreadOnly || undefined,
                tag: filters.tag || undefined,
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

    // Load all conversations for bulk add dialog
    const loadAllConversations = async () => {
        try {
            const result = await getConversations({ limit: 500 })
            setAllConversations(result.conversations)
        } catch (e) {
            console.error('Failed to load all conversations:', e)
        }
    }

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

    const handleTagsChange = async (uuid: string, newTags: string[]) => {
        try {
            await updateConversation(uuid, { tags: newTags })
            // Update local state
            setConversations(convs =>
                convs.map(c => c.uuid === uuid ? { ...c, tags: newTags } : c)
            )
        } catch (e) {
            console.error('Failed to update tags:', e)
        }
    }

    const handlePriorityChange = async (uuid: string, priority: string) => {
        const newPriority = priority.toLowerCase()
        try {
            await updateConversation(uuid, { priority: newPriority })
            // Update local state
            setConversations(convs =>
                convs.map(c => c.uuid === uuid ? { ...c, priority: newPriority } : c)
            )
        } catch (e) {
            console.error('Failed to update priority:', e)
        }
    }

    const openBulkAddDialog = async () => {
        await loadAllConversations()
        setSelectedForBulk(new Set())
        setBulkSearch('')
        setShowBulkAddDialog(true)
    }

    const handleBulkAdd = async () => {
        if (!filters.tag || selectedForBulk.size === 0) return

        try {
            await batchAddTag(Array.from(selectedForBulk), filters.tag)
            setShowBulkAddDialog(false)
            loadConversations() // Refresh
        } catch (e) {
            console.error('Failed to bulk add tag:', e)
        }
    }

    const toggleBulkSelection = (uuid: string) => {
        setSelectedForBulk(prev => {
            const next = new Set(prev)
            if (next.has(uuid)) {
                next.delete(uuid)
            } else {
                next.add(uuid)
            }
            return next
        })
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    // Get unique tags for quick filters
    const usedTags = Array.from(new Set(conversations.flatMap(c => c.tags || [])))

    // Filter conversations for bulk dialog (exclude already tagged ones)
    const bulkFilteredConversations = allConversations.filter(c => {
        // Exclude conversations that already have this tag
        if (filters.tag && (c.tags || []).includes(filters.tag)) return false
        // Search filter
        if (bulkSearch) {
            const search = bulkSearch.toLowerCase()
            return c.display_name.toLowerCase().includes(search) ||
                (c.username || '').toLowerCase().includes(search)
        }
        return true
    })

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
                        variant={filters.tag === 'High' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilters(f => ({
                            ...f,
                            tag: f.tag === 'High' ? '' : 'High'
                        }))}
                    >
                        <Tag className="h-4 w-4 mr-1" />
                        High
                    </Button>
                </div>
                {/* Tag quick filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    {usedTags.filter(t => t !== 'High').slice(0, 10).map(tag => (
                        <Badge
                            key={tag}
                            variant={filters.tag === tag ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setFilters(f => ({
                                ...f,
                                tag: f.tag === tag ? '' : tag
                            }))}
                        >
                            {tag}
                        </Badge>
                    ))}

                    {/* Add Conversations button when tag filter is active */}
                    {filters.tag && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={openBulkAddDialog}
                            className="ml-auto"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Conversations to "{filters.tag}"
                        </Button>
                    )}
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
                                                </div>
                                                {conv.username && (
                                                    <div className="text-sm text-muted-foreground">@{conv.username}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Tags display */}
                                            <TagsBadges
                                                tags={conv.tags || []}
                                                max={2}
                                            />
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
                                        {/* Tags Editor */}
                                        <div className="px-4 py-2 bg-muted/20 border-b flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Tag className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Tags:</span>
                                                <TagsEditor
                                                    tags={conv.tags || []}
                                                    suggestions={tagSuggestions}
                                                    onChange={(tags) => handleTagsChange(conv.uuid, tags)}
                                                    size="sm"
                                                />
                                            </div>

                                            <div className="flex items-center border rounded-md overflow-hidden">
                                                {PRIORITY_OPTIONS.map((option) => {
                                                    const isSelected = (conv.priority || 'medium') === option.toLowerCase()
                                                    let variant: "default" | "secondary" | "destructive" | "outline" = "outline"
                                                    let className = "h-6 rounded-none px-3 text-xs font-normal cursor-pointer hover:bg-muted"

                                                    if (isSelected) {
                                                        className += " font-medium"
                                                        if (option === 'High') {
                                                            variant = "destructive"
                                                            className += " hover:bg-destructive hover:text-destructive-foreground"
                                                        } else if (option === 'Medium') {
                                                            variant = "secondary"
                                                            className += " bg-secondary hover:bg-secondary/80"
                                                        } else {
                                                            // Low
                                                            variant = "outline"
                                                            className += " bg-background hover:bg-accent"
                                                        }
                                                    } else {
                                                        variant = "outline"
                                                        className += " text-muted-foreground hover:text-foreground"
                                                    }

                                                    return (
                                                        <Badge
                                                            key={option}
                                                            variant={isSelected ? variant : "outline"}
                                                            className={`${className} ${isSelected ? '' : 'border-transparent bg-transparent'}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handlePriorityChange(conv.uuid, option)
                                                            }}
                                                        >
                                                            {option}
                                                        </Badge>
                                                    )
                                                })}
                                            </div>
                                        </div>

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
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Bulk Add Dialog */}
            <Dialog open={showBulkAddDialog} onOpenChange={setShowBulkAddDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            Add Conversations to "{filters.tag}"
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search conversations..."
                                value={bulkSearch}
                                onChange={(e) => setBulkSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Select conversations to add the "{filters.tag}" tag.
                            Conversations already tagged are hidden.
                        </p>

                        <ScrollArea className="flex-1 border rounded-md">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4">
                                {allConversations.length === 0 ? (
                                    <div className="col-span-full text-center py-8 text-muted-foreground">
                                        <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                        <p>Loading conversations...</p>
                                    </div>
                                ) : bulkFilteredConversations.length === 0 ? (
                                    <div className="col-span-full text-center py-8 text-muted-foreground">
                                        <Tag className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                        <p>All conversations are already tagged with "{filters.tag}"</p>
                                    </div>
                                ) : (
                                    bulkFilteredConversations.slice(0, 100).map(conv => (
                                        <label
                                            key={conv.uuid}
                                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 ${selectedForBulk.has(conv.uuid) ? 'bg-primary/10 border-primary' : ''
                                                }`}
                                        >
                                            <Checkbox
                                                checked={selectedForBulk.has(conv.uuid)}
                                                onCheckedChange={() => toggleBulkSelection(conv.uuid)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">
                                                    {conv.display_name}
                                                </div>
                                                {conv.username && (
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        @{conv.username}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </ScrollArea>

                        <div className="flex items-center justify-between pt-2">
                            <span className="text-sm text-muted-foreground">
                                {selectedForBulk.size} selected
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setShowBulkAddDialog(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleBulkAdd}
                                    disabled={selectedForBulk.size === 0}
                                >
                                    Add Tag to {selectedForBulk.size} Conversations
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PageLayout>
    )
}
