import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Search,
    Users,
    User,
    Tag,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'
import {
    getRankedParticipants,
    getParticipants,
    getParticipantTags,
    updateParticipant,
} from '@/lib/api'
import type { Participant } from '@/lib/types'
import { PageLayout } from '@/components/PageLayout'
import { TagsEditor, TagsBadges } from '@/components/TagsEditor'

// Priority options - single select
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low']



export function Participants() {
    const [participants, setParticipants] = useState<Participant[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({
        tag: '',
        priority: '',
    })
    const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
    const [expandedId, setExpandedId] = useState<number | null>(null)

    // Load tag suggestions
    useEffect(() => {
        getParticipantTags().then(result => {
            setTagSuggestions(result.tags)
        }).catch(() => { })
    }, [])

    const loadParticipants = useCallback(async () => {
        try {
            setLoading(true)
            let result

            // If no filters, use ranked endpoint
            if (!search && !filters.priority && !filters.tag) {
                result = await getRankedParticipants(100)
            } else {
                result = await getParticipants({
                    search: search || undefined,
                    priority: filters.priority || undefined,
                    tag: filters.tag || undefined,
                    limit: 100,
                })
            }
            setParticipants(result.participants)
        } catch (e) {
            console.error('Failed to load participants:', e)
        } finally {
            setLoading(false)
        }
    }, [search, filters])

    useEffect(() => {
        const timer = setTimeout(() => {
            loadParticipants()
        }, 300)
        return () => clearTimeout(timer)
    }, [loadParticipants])

    // Handle priority change
    const handlePriorityChange = async (participantId: number, priority: string) => {
        const newPriority = priority.toLowerCase()
        try {
            await updateParticipant(participantId, {
                priority: newPriority,
            })
            setParticipants(participants.map(p =>
                p.id === participantId
                    ? { ...p, priority: newPriority }
                    : p
            ))
        } catch (e) {
            console.error('Failed to update priority:', e)
        }
    }

    // Handle tags change (unified)
    const handleTagsChange = async (participantId: number, newTags: string[]) => {
        try {
            await updateParticipant(participantId, { tags: newTags })
            setParticipants(participants.map(p =>
                p.id === participantId
                    ? { ...p, tags: newTags }
                    : p
            ))
        } catch (e) {
            console.error('Failed to update tags:', e)
        }
    }

    const toggleExpand = (participantId: number) => {
        setExpandedId(expandedId === participantId ? null : participantId)
    }

    // Common tags for filter bar (exclude priority strings if any)
    const usedTags = Array.from(new Set(participants.flatMap(p => p.tags || [])))
        .filter(t => !PRIORITY_OPTIONS.includes(t))

    return (
        <PageLayout variant="full">
            {/* Filters */}
            <div className="border-b p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search participants..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    {/* Priority Filter Toggle */}
                    <Button
                        variant={filters.priority === 'high' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilters(f => ({
                            ...f,
                            priority: f.priority === 'high' ? '' : 'high'
                        }))}
                    >
                        <Tag className="h-4 w-4 mr-1" />
                        High
                    </Button>
                </div>

                {/* Tag quick filters */}
                <div className="flex items-center gap-2 flex-wrap min-h-[24px]">
                    {usedTags.slice(0, 10).map(tag => (
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
                    {usedTags.length === 0 && !loading && (
                        <span className="text-xs text-muted-foreground italic">
                            Common tags will appear here...
                        </span>
                    )}
                </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
                <div className="p-4">
                    {loading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : participants.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                            <p>No participants found</p>
                            <p className="text-sm mt-2">
                                Use the Sync button in the header to fetch participants from your groups.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {participants.map((participant) => {
                                const tags = participant.tags || []
                                const priority = participant.priority || 'medium'

                                return (
                                    <div
                                        key={participant.id}
                                        className="rounded-lg border bg-card overflow-hidden"
                                    >
                                        {/* Header - clickable to expand */}
                                        <div
                                            className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => toggleExpand(participant.id)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                                        <User className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium flex items-center gap-2">
                                                            {participant.display_name}
                                                        </div>
                                                        {participant.username && (
                                                            <div className="text-sm text-muted-foreground">
                                                                @{participant.username}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <TagsBadges tags={tags} max={3} />

                                                    {priority === 'high' && (
                                                        <Badge variant="destructive">High</Badge>
                                                    )}

                                                    <Badge variant="secondary" className="text-xs">
                                                        <Users className="h-3 w-3 mr-1" />
                                                        {participant.shared_groups_count} groups
                                                    </Badge>
                                                    {expandedId === participant.id ? (
                                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded: Editor */}
                                        {expandedId === participant.id && (
                                            <div className="border-t bg-muted/20">
                                                <div className="px-4 py-2 flex items-center justify-between">
                                                    {/* Unified Tags Editor */}
                                                    <div className="flex items-center gap-2 flex-1 mr-4">
                                                        <Tag className="h-4 w-4 text-muted-foreground" />
                                                        <span className="text-sm text-muted-foreground">Tags:</span>
                                                        <TagsEditor
                                                            tags={tags}
                                                            suggestions={tagSuggestions}
                                                            onChange={(newTags) => handleTagsChange(participant.id, newTags)}
                                                            size="sm"
                                                        />
                                                    </div>

                                                    {/* Priority Toggle */}
                                                    <div className="flex items-center border rounded-md overflow-hidden bg-background">
                                                        {PRIORITY_OPTIONS.map((option) => {
                                                            const isSelected = (priority || 'medium') === option.toLowerCase()
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
                                                                        handlePriorityChange(participant.id, option.toLowerCase())
                                                                    }}
                                                                >
                                                                    {option}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </PageLayout>
    )
}
