import { useState, useRef, useMemo } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TagsEditorProps {
    tags: string[]
    suggestions?: string[]
    onChange: (tags: string[]) => void
    placeholder?: string
    size?: 'sm' | 'default'
}

export function TagsEditor({
    tags,
    suggestions = [],
    onChange,
    placeholder = 'Add tag...',
    size = 'default',
}: TagsEditorProps) {
    const [inputValue, setInputValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const addTag = (tag: string) => {
        const trimmed = tag.trim()
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed])
        }
        setInputValue('')
    }

    const removeTag = (tagToRemove: string) => {
        onChange(tags.filter(t => t !== tagToRemove))
    }

    // Filter suggestions to exclude already-selected tags
    const availableSuggestions = useMemo(() =>
        suggestions.filter(s => !tags.includes(s)),
        [suggestions, tags]
    )

    // Find best autocomplete match based on what user typed
    const autocompleteMatch = useMemo(() => {
        if (!inputValue.trim()) return null
        const input = inputValue.toLowerCase()
        return availableSuggestions.find(s =>
            s.toLowerCase().startsWith(input)
        ) || null
    }, [inputValue, availableSuggestions])

    // Filter suggestions for display
    const displayedSuggestions = useMemo(() => {
        const input = inputValue.toLowerCase()
        if (!input) {
            return availableSuggestions.slice(0, 6)
        }
        return availableSuggestions
            .filter(s => s.toLowerCase().includes(input))
            .slice(0, 6)
    }, [inputValue, availableSuggestions])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            // If we have an autocomplete match that strictly extends input, use it
            if (autocompleteMatch && autocompleteMatch.length > inputValue.length) {
                addTag(autocompleteMatch)
            } else if (inputValue.trim()) {
                addTag(inputValue)
            }
        }
        if (e.key === 'Tab' && autocompleteMatch) {
            e.preventDefault()
            addTag(autocompleteMatch)
        }
        if (e.key === 'ArrowRight' && autocompleteMatch) {
            // Only autocomplete if cursor is at the end
            const input = inputRef.current
            if (input && input.selectionStart === inputValue.length) {
                e.preventDefault()
                // Fill the input with the autocomplete value but don't add tag yet
                setInputValue(autocompleteMatch)
            }
        }
        if (e.key === 'Escape') {
            setInputValue('')
        }
        if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags[tags.length - 1])
        }
    }

    const handleSuggestionClick = (suggestion: string) => {
        addTag(suggestion)
        inputRef.current?.focus()
    }

    const badgeSize = size === 'sm' ? 'text-xs px-1.5 py-0' : ''
    const inputClasses = size === 'sm'
        ? 'h-6 w-28 text-xs px-2 py-0'
        : 'h-8 w-32'

    // Match exact padding of the Input component for the background layer
    // Input component uses "px-3 py-1" by default, but we're overriding it in inputClasses
    // We need to ensure these match PERFECTLY
    const ghostLayerClasses = cn(
        "absolute inset-0 flex items-center pointer-events-none select-none border border-transparent",
        size === 'sm' ? 'px-2 text-xs' : 'px-3 text-sm'
    )

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {/* Existing tags */}
            {tags.map((tag) => (
                <Badge
                    key={tag}
                    variant="secondary"
                    className={`${badgeSize} cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors`}
                    onClick={() => removeTag(tag)}
                >
                    {tag}
                    <X className="h-3 w-3 ml-1" />
                </Badge>
            ))}

            <div className="relative">
                {/* Background Layer (Ghost Text) */}
                {autocompleteMatch && (
                    <div
                        className={ghostLayerClasses}
                        aria-hidden="true"
                    >
                        <span className="opacity-0">{inputValue}</span>
                        <span className="text-muted-foreground/50">
                            {autocompleteMatch.slice(inputValue.length)}
                        </span>
                    </div>
                )}

                {/* Foreground Layer (Active Input) */}
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={tags.length === 0 ? placeholder : 'Add...'}
                    className={cn(
                        inputClasses,
                        // Critical: transparent background so ghost text shows through
                        "bg-transparent relative z-10 focus-visible:ring-0 focus-visible:ring-offset-0 border-transparent focus:border-input"
                    )}
                    // Remove auto-correction attributes that might interfere
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck="false"
                />
            </div>

            {/* Horizontal suggestions */}
            {displayedSuggestions.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-muted-foreground/60 text-xs mx-1">|</span>
                    {displayedSuggestions.map((suggestion) => (
                        <Badge
                            key={suggestion}
                            variant="outline"
                            className={`${badgeSize} cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors opacity-70 hover:opacity-100`}
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            <Plus className="h-2.5 w-2.5 mr-0.5" />
                            {suggestion}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    )
}

// Inline badge display for compact views
interface TagsBadgesProps {
    tags: string[]
    max?: number
    onClick?: () => void
}

export function TagsBadges({ tags, max = 3, onClick }: TagsBadgesProps) {
    if (tags.length === 0) return null

    const displayed = tags.slice(0, max)
    const remaining = tags.length - max

    return (
        <div
            className={`flex flex-wrap gap-1 ${onClick ? 'cursor-pointer' : ''}`}
            onClick={onClick}
        >
            {displayed.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                    {tag}
                </Badge>
            ))}
            {remaining > 0 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                    +{remaining}
                </Badge>
            )}
        </div>
    )
}
