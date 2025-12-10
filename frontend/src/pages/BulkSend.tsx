import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
    Send,
    CheckCircle,
    AlertTriangle,
    Users,
    ChevronRight,
    ChevronLeft,
    Loader2
} from 'lucide-react'
import { getConversations, bulkSendPreview, bulkSendExecute } from '@/lib/api'
import type { Conversation, BulkSendPreview } from '@/lib/types'

type Step = 'select' | 'compose' | 'confirm'

export function BulkSend() {
    const [step, setStep] = useState<Step>('select')
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [idsInput, setIdsInput] = useState('')
    const [template, setTemplate] = useState('')
    const [preview, setPreview] = useState<BulkSendPreview | null>(null)
    const [confirmCode, setConfirmCode] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')

    const loadConversations = useCallback(async () => {
        try {
            const result = await getConversations({ limit: 200 })
            setConversations(result.conversations)
        } catch (e) {
            console.error('Failed to load conversations:', e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadConversations()
    }, [loadConversations])

    const handleToggle = (uuid: string) => {
        const newSelected = new Set(selected)
        if (newSelected.has(uuid)) {
            newSelected.delete(uuid)
        } else {
            newSelected.add(uuid)
        }
        setSelected(newSelected)
    }

    const handleLoadIds = () => {
        if (!idsInput.trim()) return

        const ids = idsInput.split(/[,\n]/).map(id => id.trim()).filter(id => id)
        const newSelected = new Set(selected)

        ids.forEach(id => {
            // Match by UUID or tg_id
            const conv = conversations.find(c =>
                c.uuid === id || String(c.tg_id) === id
            )
            if (conv) {
                newSelected.add(conv.uuid)
            }
        })

        setSelected(newSelected)
        setIdsInput('')
    }

    const handlePreview = async () => {
        if (selected.size === 0 || !template.trim()) return

        setError('')
        try {
            const result = await bulkSendPreview(Array.from(selected), template)
            setPreview(result)
            setStep('confirm')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Preview failed')
        }
    }

    const handleSend = async () => {
        if (!preview || confirmCode !== preview.confirmation_code) return

        setSending(true)
        setError('')
        try {
            await bulkSendExecute(Array.from(selected), template, confirmCode)
            // Reset
            setStep('select')
            setSelected(new Set())
            setTemplate('')
            setPreview(null)
            setConfirmCode('')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Send failed')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Progress Steps */}
            <div className="flex items-center justify-center mb-8">
                <div className={`flex items-center gap-2 ${step === 'select' ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        1
                    </div>
                    <span className="font-medium">Select</span>
                </div>
                <ChevronRight className="mx-4 h-4 w-4 text-muted-foreground" />
                <div className={`flex items-center gap-2 ${step === 'compose' ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step === 'compose' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        2
                    </div>
                    <span className="font-medium">Compose</span>
                </div>
                <ChevronRight className="mx-4 h-4 w-4 text-muted-foreground" />
                <div className={`flex items-center gap-2 ${step === 'confirm' ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step === 'confirm' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        3
                    </div>
                    <span className="font-medium">Confirm</span>
                </div>
            </div>

            {/* Step 1: Select Recipients */}
            {step === 'select' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Select Recipients
                        </CardTitle>
                        <CardDescription>
                            Choose conversations to send your message to. Selected: {selected.size}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* ID Input */}
                        <div className="space-y-2">
                            <Label>Load by IDs (comma or newline separated)</Label>
                            <div className="flex gap-2">
                                <Textarea
                                    placeholder="uuid1, uuid2, or chat_id1, chat_id2..."
                                    value={idsInput}
                                    onChange={(e) => setIdsInput(e.target.value)}
                                    className="flex-1"
                                    rows={2}
                                />
                                <Button variant="outline" onClick={handleLoadIds}>
                                    Load
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        {/* Conversation List */}
                        <Label>Or select from list</Label>
                        <ScrollArea className="h-64 border rounded-lg">
                            <div className="p-2 space-y-1">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <Skeleton key={i} className="h-10 w-full" />
                                    ))
                                ) : (
                                    conversations.map((conv) => (
                                        <button
                                            key={conv.uuid}
                                            onClick={() => handleToggle(conv.uuid)}
                                            className={`w-full flex items-center justify-between p-2 rounded transition-colors ${selected.has(conv.uuid)
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'hover:bg-muted'
                                                }`}
                                        >
                                            <span className="truncate">{conv.display_name}</span>
                                            {selected.has(conv.uuid) && (
                                                <CheckCircle className="h-4 w-4 shrink-0" />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </ScrollArea>

                        <div className="flex justify-end">
                            <Button
                                onClick={() => setStep('compose')}
                                disabled={selected.size === 0}
                            >
                                Continue
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Compose */}
            {step === 'compose' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5" />
                            Compose Message
                        </CardTitle>
                        <CardDescription>
                            Write your message. Use tokens for personalization.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                            <p className="font-medium mb-1">Available tokens:</p>
                            <code className="text-xs">{"{{display_name}}"}</code> - Full name<br />
                            <code className="text-xs">{"{{first_name}}"}</code> - First name<br />
                            <code className="text-xs">{"{{username}}"}</code> - @username
                        </div>

                        <div className="space-y-2">
                            <Label>Message Template</Label>
                            <Textarea
                                placeholder={`Hey {{first_name}}, just checking in...`}
                                value={template}
                                onChange={(e) => setTemplate(e.target.value)}
                                rows={6}
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep('select')}>
                                <ChevronLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                            <Button
                                onClick={handlePreview}
                                disabled={!template.trim()}
                            >
                                Preview
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Confirm */}
            {step === 'confirm' && preview && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirm Send
                        </CardTitle>
                        <CardDescription>
                            Review the messages below. This action cannot be undone.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Recipients:</span>
                                <span className="font-medium">{preview.total_count}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Delay between sends:</span>
                                <span className="font-medium">{preview.delay_seconds}s</span>
                            </div>
                        </div>

                        <Separator />

                        <Label>Preview (first 5)</Label>
                        <ScrollArea className="h-48 border rounded-lg">
                            <div className="p-3 space-y-3">
                                {preview.recipients.slice(0, 5).map((r) => (
                                    <div key={r.conversation_uuid} className="rounded bg-muted p-3">
                                        <div className="font-medium text-sm">{r.display_name}</div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {r.rendered_message}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        <Separator />

                        <div className="space-y-2">
                            <Label>Type <code className="bg-muted px-1 rounded">{preview.confirmation_code}</code> to confirm:</Label>
                            <Input
                                placeholder={preview.confirmation_code}
                                value={confirmCode}
                                onChange={(e) => setConfirmCode(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep('compose')}>
                                <ChevronLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleSend}
                                disabled={confirmCode !== preview.confirmation_code || sending}
                            >
                                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Send Messages
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
