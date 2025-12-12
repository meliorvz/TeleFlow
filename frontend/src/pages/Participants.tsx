import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Search,
    Users,
    User,
    Tag,
    ChevronDown,
    ChevronUp,
    Plus,
} from 'lucide-react'
import {
    getRankedParticipants,
    getParticipants,
    getParticipantTags,
    updateParticipant,
    batchAddParticipantTag,
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

    // Bulk add state
    const [allParticipants, setAllParticipants] = useState<Participant[]>([])
    const [showBulkAddDialog, setShowBulkAddDialog] = useState(false)
    const [bulkSearch, setBulkSearch] = useState('')
    const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set())

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

    // Bulk add handlers
    const loadAllParticipants = async () => {
        try {
            const result = await getParticipants({ limit: 500 })
            setAllParticipants(result.participants)
        } catch (e) {
            console.error('Failed to load all participants:', e)
        }
    }

    const openBulkAddDialog = async () => {
        await loadAllParticipants()
        setSelectedForBulk(new Set())
        setBulkSearch('')
        setShowBulkAddDialog(true)
    }

    const handleBulkAdd = async () => {
        if (!filters.tag || selectedForBulk.size === 0) return

        try {
            await batchAddParticipantTag(Array.from(selectedForBulk), filters.tag)
            setShowBulkAddDialog(false)
            loadParticipants() // Refresh
        } catch (e) {
            console.error('Failed to bulk add tag:', e)
        }
    }

    const toggleBulkSelection = (id: number) => {
        setSelectedForBulk(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    // Filter participants for bulk dialog (exclude already tagged ones)
    const bulkFilteredParticipants = allParticipants.filter(p => {
        // Exclude participants that already have this tag
        if (filters.tag && (p.tags || []).includes(filters.tag)) return false
        // Search filter
        if (bulkSearch) {
            const search = bulkSearch.toLowerCase()
            return p.display_name.toLowerCase().includes(search) ||
                (p.username || '').toLowerCase().includes(search)
        }
        return true
    })

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
                    {/* Priority Filter Slider */}
                    <div className="flex items-center border rounded-md overflow-hidden ml-auto">
                        {PRIORITY_OPTIONS.map((option) => {
                            const optionLower = option.toLowerCase()
                            const isSelected = filters.priority === optionLower
                            let variant: "default" | "secondary" | "destructive" | "outline" = "outline"
                            let className = "h-7 rounded-none px-3 text-xs font-normal cursor-pointer hover:bg-muted"

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
                                    onClick={() => setFilters(f => ({
                                        ...f,
                                        priority: f.priority === optionLower ? '' : optionLower
                                    }))}
                                >
                                    {option}
                                </Badge>
                            )
                        })}
                    </div>
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

                    {/* Add Participants button when tag filter is active */}
                    {filters.tag && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={openBulkAddDialog}
                            className="ml-auto"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Participants to "{filters.tag}"
                        </Button>
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

            {/* Bulk Add Dialog */}
            <Dialog open={showBulkAddDialog} onOpenChange={setShowBulkAddDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle>
                            Add Participants to "{filters.tag}"
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
                        <div className="relative flex-shrink-0">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search participants..."
                                value={bulkSearch}
                                onChange={(e) => setBulkSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <p className="text-sm text-muted-foreground flex-shrink-0">
                            Select participants to add the "{filters.tag}" tag.
                            Participants already tagged are hidden.
                        </p>

                        <div className="flex-1 min-h-0 border rounded-md overflow-y-auto">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4">
                                {allParticipants.length === 0 ? (
                                    <div className="col-span-full text-center py-8 text-muted-foreground">
                                        <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                        <p>Loading participants...</p>
                                    </div>
                                ) : bulkFilteredParticipants.length === 0 ? (
                                    <div className="col-span-full text-center py-8 text-muted-foreground">
                                        <Tag className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                        <p>All participants are already tagged with "{filters.tag}"</p>
                                    </div>
                                ) : (
                                    bulkFilteredParticipants.slice(0, 100).map(p => (
                                        <label
                                            key={p.id}
                                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 ${selectedForBulk.has(p.id) ? 'bg-primary/10 border-primary' : ''
                                                }`}
                                        >
                                            <Checkbox
                                                checked={selectedForBulk.has(p.id)}
                                                onCheckedChange={() => toggleBulkSelection(p.id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">
                                                    {p.display_name}
                                                </div>
                                                {p.username && (
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        @{p.username}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 flex-shrink-0">
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
                                    Add Tag to {selectedForBulk.size} Participants
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PageLayout>
    )
}
