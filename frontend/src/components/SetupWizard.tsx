import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Check, AlertCircle, Loader2, Shield, Zap } from 'lucide-react'
import { saveConfig } from '@/lib/api'

interface SetupWizardProps {
    onComplete: () => void
}

type LLMProvider = 'openrouter' | 'venice' | null

export function SetupWizard({ onComplete }: SetupWizardProps) {
    const [tgApiId, setTgApiId] = useState('')
    const [tgApiHash, setTgApiHash] = useState('')
    const [llmProvider, setLlmProvider] = useState<LLMProvider>(null)
    const [openrouterKey, setOpenrouterKey] = useState('')
    const [veniceKey, setVeniceKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSaving(true)

        try {
            await saveConfig({
                tg_api_id: tgApiId,
                tg_api_hash: tgApiHash,
                llm_provider: llmProvider || undefined,
                openrouter_api_key: llmProvider === 'openrouter' ? openrouterKey : undefined,
                venice_api_key: llmProvider === 'venice' ? veniceKey : undefined,
            })
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration')
        } finally {
            setSaving(false)
        }
    }

    const isTelegramValid = tgApiId.length > 0 && tgApiHash.length > 0
    const isLlmConfigured = llmProvider && (
        (llmProvider === 'openrouter' && openrouterKey) ||
        (llmProvider === 'venice' && veniceKey)
    )

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 dark">
            <Card className="w-full max-w-2xl">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl">
                        📱
                    </div>
                    <CardTitle className="text-2xl">Welcome to TeleFlow</CardTitle>
                    <CardDescription>
                        Let's get you set up. You'll need API credentials to connect to Telegram.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Telegram Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">Telegram API</h3>
                                <span className="text-xs text-destructive">Required</span>
                            </div>

                            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                                <p className="mb-2">To get your Telegram API credentials:</p>
                                <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                                    <li>Go to <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                        my.telegram.org <ExternalLink className="h-3 w-3" />
                                    </a></li>
                                    <li>Log in with your phone number</li>
                                    <li>Click "API development tools"</li>
                                    <li>Create an application (any name/platform is fine)</li>
                                    <li>Copy the <strong>api_id</strong> and <strong>api_hash</strong></li>
                                </ol>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="api-id">API ID</Label>
                                    <Input
                                        id="api-id"
                                        placeholder="12345678"
                                        value={tgApiId}
                                        onChange={(e) => setTgApiId(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="api-hash">API Hash</Label>
                                    <Input
                                        id="api-hash"
                                        placeholder="abc123def456..."
                                        value={tgApiHash}
                                        onChange={(e) => setTgApiHash(e.target.value)}
                                    />
                                </div>
                            </div>

                            {isTelegramValid && (
                                <div className="flex items-center gap-2 text-sm text-green-500">
                                    <Check className="h-4 w-4" />
                                    Telegram credentials entered
                                </div>
                            )}
                        </div>

                        <Separator />

                        {/* LLM Provider Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">AI Provider</h3>
                                <span className="text-xs text-muted-foreground">Optional</span>
                            </div>

                            <p className="text-sm text-muted-foreground">
                                Choose an AI provider to enable smart message triage and reports.
                            </p>

                            {/* Provider Selection Cards */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {/* OpenRouter Option */}
                                <button
                                    type="button"
                                    onClick={() => setLlmProvider('openrouter')}
                                    className={`rounded-lg border-2 p-4 text-left transition-all ${llmProvider === 'openrouter'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap className="h-5 w-5 text-amber-500" />
                                        <span className="font-semibold">OpenRouter</span>
                                        {llmProvider === 'openrouter' && (
                                            <Check className="h-4 w-4 text-primary ml-auto" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Most reliable • 400+ models • Automatic failovers
                                    </p>
                                </button>

                                {/* Venice Option */}
                                <button
                                    type="button"
                                    onClick={() => setLlmProvider('venice')}
                                    className={`rounded-lg border-2 p-4 text-left transition-all ${llmProvider === 'venice'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield className="h-5 w-5 text-green-500" />
                                        <span className="font-semibold">Venice AI</span>
                                        {llmProvider === 'venice' && (
                                            <Check className="h-4 w-4 text-primary ml-auto" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Maximum privacy • Zero logging • For sensitive work
                                    </p>
                                </button>
                            </div>

                            {/* OpenRouter Config */}
                            {llmProvider === 'openrouter' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                                        <p className="mb-2">To get your OpenRouter API key:</p>
                                        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                                            <li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                                openrouter.ai/keys <ExternalLink className="h-3 w-3" />
                                            </a></li>
                                            <li>Create an account or sign in</li>
                                            <li>Create a new key and copy it</li>
                                        </ol>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="openrouter-key">API Key</Label>
                                        <Input
                                            id="openrouter-key"
                                            type="password"
                                            placeholder="sk-or-..."
                                            value={openrouterKey}
                                            onChange={(e) => setOpenrouterKey(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Venice Config */}
                            {llmProvider === 'venice' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                                        <div className="flex items-start gap-2 mb-2">
                                            <Shield className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                            <p className="text-green-600 dark:text-green-400 font-medium">
                                                Your prompts and responses are never stored or logged.
                                            </p>
                                        </div>
                                        <p className="mb-2">To get your Venice API key:</p>
                                        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                                            <li>Go to <a href="https://venice.ai/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                                venice.ai/settings/api <ExternalLink className="h-3 w-3" />
                                            </a></li>
                                            <li>Create an account or sign in</li>
                                            <li>Generate an API key and copy it</li>
                                        </ol>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="venice-key">API Key</Label>
                                        <Input
                                            id="venice-key"
                                            type="password"
                                            placeholder="venice-..."
                                            value={veniceKey}
                                            onChange={(e) => setVeniceKey(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {isLlmConfigured && (
                                <div className="flex items-center gap-2 text-sm text-green-500">
                                    <Check className="h-4 w-4" />
                                    AI features will be enabled
                                </div>
                            )}

                            {!llmProvider && (
                                <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm">
                                    <p className="font-medium text-muted-foreground mb-1">
                                        ✨ Skip for maximum privacy
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Without an AI provider, no message data leaves your device.
                                        Reports will still prioritize conversations where you're @mentioned
                                        or replied to. You can add AI later in Settings.
                                    </p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-4">
                            <Button
                                type="submit"
                                disabled={!isTelegramValid || saving}
                                size="lg"
                            >
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Continue
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
