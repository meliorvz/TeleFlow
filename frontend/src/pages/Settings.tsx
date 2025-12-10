import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
    Settings,
    Database,
    Download,
    Upload,
    Trash2,
    ExternalLink,
    AlertCircle,
    Check,
    Loader2
} from 'lucide-react'
import {
    clearMessageCache,
    saveConfig,
    uploadConversationsCsv,
    uploadParticipantsCsv
} from '@/lib/api'
import type { Status } from '@/lib/types'

interface SettingsPageProps {
    status: Status | null
    onRefresh: () => void
}

export function SettingsPage({ status, onRefresh }: SettingsPageProps) {
    const [clearingCache, setClearingCache] = useState(false)
    const [apiKey, setApiKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [uploadResult, setUploadResult] = useState<{ type: string; result: string } | null>(null)
    const [uploadLoading, setUploadLoading] = useState(false)

    const convFileRef = useRef<HTMLInputElement>(null)
    const partFileRef = useRef<HTMLInputElement>(null)

    const handleClearCache = async () => {
        setClearingCache(true)
        try {
            await clearMessageCache()
        } catch (e) {
            console.error('Failed to clear cache:', e)
        } finally {
            setClearingCache(false)
        }
    }

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) return

        setSaving(true)
        setSaveSuccess(false)
        try {
            await saveConfig({ openrouter_api_key: apiKey })
            setSaveSuccess(true)
            setApiKey('')
            onRefresh()
        } catch (e) {
            console.error('Failed to save:', e)
        } finally {
            setSaving(false)
        }
    }

    const handleConversationsCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadLoading(true)
        setUploadResult(null)
        try {
            const result = await uploadConversationsCsv(file)
            setUploadResult({
                type: 'success',
                result: `Imported ${result.imported} conversations`
            })
        } catch (e) {
            setUploadResult({ type: 'error', result: 'Upload failed' })
        } finally {
            setUploadLoading(false)
            if (convFileRef.current) convFileRef.current.value = ''
        }
    }

    const handleParticipantsCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadLoading(true)
        setUploadResult(null)
        try {
            const result = await uploadParticipantsCsv(file)
            setUploadResult({
                type: 'success',
                result: `Imported ${result.imported} participants`
            })
        } catch (e) {
            setUploadResult({ type: 'error', result: 'Upload failed' })
        } finally {
            setUploadLoading(false)
            if (partFileRef.current) partFileRef.current.value = ''
        }
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            {/* Connection Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Connection Status
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span>Telegram</span>
                        {status?.telegram_connected ? (
                            <span className="flex items-center gap-2 text-sm text-green-500">
                                <Check className="h-4 w-4" />
                                Connected as {status.user?.first_name}
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                Not connected
                            </span>
                        )}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                        <span>LLM (OpenRouter)</span>
                        {status?.llm_enabled ? (
                            <span className="flex items-center gap-2 text-sm text-green-500">
                                <Check className="h-4 w-4" />
                                Enabled
                            </span>
                        ) : (
                            <span className="text-sm text-muted-foreground">Disabled</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* LLM Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>LLM Configuration</CardTitle>
                    <CardDescription>
                        Update your OpenRouter API key to enable AI-powered reports.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>OpenRouter API Key</Label>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                placeholder="sk-or-..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            <Button onClick={handleSaveApiKey} disabled={!apiKey.trim() || saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save
                            </Button>
                        </div>
                        {saveSuccess && (
                            <p className="text-sm text-green-500 flex items-center gap-1">
                                <Check className="h-4 w-4" />
                                Saved successfully
                            </p>
                        )}
                    </div>
                    <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                        Get API key from OpenRouter
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </CardContent>
            </Card>

            {/* Data Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Data Management
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Message Cache</p>
                            <p className="text-sm text-muted-foreground">Clear all cached messages</p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearCache}
                            disabled={clearingCache}
                        >
                            {clearingCache ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Clear Cache
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Import/Export */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Import / Export
                    </CardTitle>
                    <CardDescription>
                        Manage conversation metadata and participants via CSV.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Upload Result */}
                    {uploadResult && (
                        <div className={`p-3 rounded-lg border ${uploadResult.type === 'success'
                                ? 'bg-green-500/10 border-green-500/30 text-green-500'
                                : 'bg-destructive/10 border-destructive/30 text-destructive'
                            }`}>
                            {uploadResult.result}
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Conversations</p>
                            <p className="text-sm text-muted-foreground">Import/export conversation metadata</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <a href="/api/csv/conversations/export" download>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => convFileRef.current?.click()}
                                disabled={uploadLoading}
                            >
                                <Upload className="mr-2 h-4 w-4" />
                                Import
                            </Button>
                            <input
                                ref={convFileRef}
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleConversationsCsvUpload}
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Participants</p>
                            <p className="text-sm text-muted-foreground">Import/export participant metadata</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <a href="/api/csv/participants/export" download>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => partFileRef.current?.click()}
                                disabled={uploadLoading}
                            >
                                <Upload className="mr-2 h-4 w-4" />
                                Import
                            </Button>
                            <input
                                ref={partFileRef}
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleParticipantsCsvUpload}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
