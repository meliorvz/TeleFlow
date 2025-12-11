import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Settings,
    Database,
    Download,
    Upload,
    Trash2,
    ExternalLink,
    AlertCircle,
    Check,
    Loader2,
    Shield,
    Zap,
    AlertTriangle,
    RefreshCw
} from 'lucide-react'
import {
    clearMessageCache,
    saveConfig,
    uploadConversationsCsv,
    uploadParticipantsCsv,
    getConfig
} from '@/lib/api'
import type { Status } from '@/lib/types'
import { PageLayout } from '@/components/PageLayout'

interface SettingsPageProps {
    status: Status | null
    onRefresh: () => void
}

type LLMProvider = 'openrouter' | 'venice'

export function SettingsPage({ status, onRefresh }: SettingsPageProps) {
    const [clearingCache, setClearingCache] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('openrouter')
    const [openrouterKey, setOpenrouterKey] = useState('')
    const [veniceKey, setVeniceKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [uploadResult, setUploadResult] = useState<{ type: string; result: string } | null>(null)
    const [uploadLoading, setUploadLoading] = useState(false)

    const convFileRef = useRef<HTMLInputElement>(null)
    const partFileRef = useRef<HTMLInputElement>(null)

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deletingData, setDeletingData] = useState(false)
    const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null)
    const [terminateTelegram, setTerminateTelegram] = useState(true) // Recommended for security

    // Sync settings state
    const [syncInterval, setSyncInterval] = useState<number>(10)
    const [savingSyncInterval, setSavingSyncInterval] = useState(false)
    const [syncIntervalSaveSuccess, setSyncIntervalSaveSuccess] = useState(false)

    // Load current config on mount
    useEffect(() => {
        getConfig().then((config: any) => {
            if (config.sync_interval_minutes !== undefined) {
                setSyncInterval(config.sync_interval_minutes)
            }
        }).catch(() => { })
    }, [])

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

    const handleSaveSyncInterval = async () => {
        setSavingSyncInterval(true)
        setSyncIntervalSaveSuccess(false)
        try {
            await saveConfig({ sync_interval_minutes: syncInterval } as any)
            setSyncIntervalSaveSuccess(true)
            setTimeout(() => setSyncIntervalSaveSuccess(false), 3000)
        } catch (e) {
            console.error('Failed to save sync interval:', e)
        } finally {
            setSavingSyncInterval(false)
        }
    }

    const handleSaveApiKey = async () => {
        const apiKey = selectedProvider === 'openrouter' ? openrouterKey : veniceKey
        if (!apiKey.trim()) return

        setSaving(true)
        setSaveSuccess(false)
        try {
            await saveConfig({
                llm_provider: selectedProvider,
                openrouter_api_key: selectedProvider === 'openrouter' ? apiKey : undefined,
                venice_api_key: selectedProvider === 'venice' ? apiKey : undefined,
            })
            setSaveSuccess(true)
            setOpenrouterKey('')
            setVeniceKey('')
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

    const handleDeleteAllData = async () => {
        setDeletingData(true)
        setDeleteResult(null)
        try {
            const url = `/api/data/reset?terminate_telegram=${terminateTelegram}`
            const res = await fetch(url, { method: 'DELETE' })
            const data = await res.json()
            if (res.ok) {
                let message = data.message || 'Data cleared successfully'
                if (terminateTelegram && data.telegram_logged_out) {
                    message = 'Data cleared and Telegram session terminated.'
                } else if (terminateTelegram && !data.telegram_logged_out) {
                    message = 'Data cleared. Note: Telegram session could not be terminated (may need manual removal from Telegram settings).'
                }
                setDeleteResult({ success: true, message })
                setShowDeleteConfirm(false)
                // Refresh after a short delay to show the message
                setTimeout(() => window.location.reload(), 2000)
            } else {
                setDeleteResult({ success: false, message: 'Failed to delete data' })
            }
        } catch (e) {
            setDeleteResult({ success: false, message: 'Failed to delete data' })
        } finally {
            setDeletingData(false)
        }
    }

    const currentApiKey = selectedProvider === 'openrouter' ? openrouterKey : veniceKey
    const setCurrentApiKey = selectedProvider === 'openrouter' ? setOpenrouterKey : setVeniceKey

    return (
        <PageLayout className="space-y-6">
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
                        <span>AI Provider</span>
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

            {/* Sync Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        Sync Settings
                    </CardTitle>
                    <CardDescription>
                        Configure how often Teleapps syncs conversations from Telegram.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="sync-interval">Sync Interval (minutes)</Label>
                        <p className="text-sm text-muted-foreground">
                            Set how frequently your Telegram conversations are synced automatically. Set to 0 to disable auto-sync.
                        </p>
                        <div className="flex gap-2">
                            <Input
                                id="sync-interval"
                                type="number"
                                min={0}
                                max={1440}
                                value={syncInterval}
                                onChange={(e) => setSyncInterval(parseInt(e.target.value) || 0)}
                                className="w-32"
                            />
                            <Button onClick={handleSaveSyncInterval} disabled={savingSyncInterval}>
                                {savingSyncInterval && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save
                            </Button>
                        </div>
                        {syncIntervalSaveSuccess && (
                            <p className="text-sm text-green-500 flex items-center gap-1">
                                <Check className="h-4 w-4" />
                                Saved (restart server to apply)
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* LLM Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>AI Provider Configuration</CardTitle>
                    <CardDescription>
                        Configure your AI provider for smart message triage and reports.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Provider Selection */}
                    <div className="space-y-3">
                        <Label>Provider</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {/* OpenRouter Option */}
                            <button
                                type="button"
                                onClick={() => setSelectedProvider('openrouter')}
                                className={`rounded-lg border-2 p-3 text-left transition-all ${selectedProvider === 'openrouter'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted hover:border-muted-foreground/50'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-amber-500" />
                                    <span className="font-medium">OpenRouter</span>
                                    {selectedProvider === 'openrouter' && (
                                        <Check className="h-4 w-4 text-primary ml-auto" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    400+ models • Automatic failovers
                                </p>
                            </button>

                            {/* Venice Option */}
                            <button
                                type="button"
                                onClick={() => setSelectedProvider('venice')}
                                className={`rounded-lg border-2 p-3 text-left transition-all ${selectedProvider === 'venice'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted hover:border-muted-foreground/50'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-green-500" />
                                    <span className="font-medium">Venice AI</span>
                                    {selectedProvider === 'venice' && (
                                        <Check className="h-4 w-4 text-primary ml-auto" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Zero logging • Maximum privacy
                                </p>
                            </button>
                        </div>
                    </div>

                    <Separator />

                    {/* API Key Input */}
                    <div className="space-y-2">
                        <Label>
                            {selectedProvider === 'openrouter' ? 'OpenRouter' : 'Venice AI'} API Key
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                placeholder={selectedProvider === 'openrouter' ? 'sk-or-...' : 'venice-...'}
                                value={currentApiKey}
                                onChange={(e) => setCurrentApiKey(e.target.value)}
                            />
                            <Button onClick={handleSaveApiKey} disabled={!currentApiKey.trim() || saving}>
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
                        href={selectedProvider === 'openrouter'
                            ? 'https://openrouter.ai/keys'
                            : 'https://venice.ai/settings/api'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                        Get API key from {selectedProvider === 'openrouter' ? 'OpenRouter' : 'Venice AI'}
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

                    <Separator />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-destructive">Delete All Local Data</p>
                                <p className="text-sm text-muted-foreground">Remove database, Telegram session, and config</p>
                            </div>
                            {!showDeleteConfirm ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete All Data
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowDeleteConfirm(false)}
                                        disabled={deletingData}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleDeleteAllData}
                                        disabled={deletingData}
                                    >
                                        {deletingData ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <AlertTriangle className="mr-2 h-4 w-4" />
                                        )}
                                        Confirm Delete
                                    </Button>
                                </div>
                            )}
                        </div>

                        {showDeleteConfirm && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                                <Checkbox
                                    id="terminate-telegram"
                                    checked={terminateTelegram}
                                    onCheckedChange={(checked: boolean | 'indeterminate') => setTerminateTelegram(checked === true)}
                                />
                                <div className="space-y-1">
                                    <Label
                                        htmlFor="terminate-telegram"
                                        className="text-sm font-medium cursor-pointer"
                                    >
                                        Also terminate Telegram session
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Removes this device from your Telegram active sessions list.
                                        Recommended for security.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {deleteResult && (
                        <div className={`p-3 rounded-lg border ${deleteResult.success
                            ? 'bg-green-500/10 border-green-500/30 text-green-500'
                            : 'bg-destructive/10 border-destructive/30 text-destructive'
                            }`}>
                            {deleteResult.message}
                        </div>
                    )}
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
        </PageLayout>
    )
}
