import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Check, AlertCircle, Loader2 } from 'lucide-react'
import { saveConfig } from '@/lib/api'

interface SetupWizardProps {
    onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
    const [tgApiId, setTgApiId] = useState('')
    const [tgApiHash, setTgApiHash] = useState('')
    const [openrouterKey, setOpenrouterKey] = useState('')
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
                openrouter_api_key: openrouterKey || undefined,
            })
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration')
        } finally {
            setSaving(false)
        }
    }

    const isTelegramValid = tgApiId.length > 0 && tgApiHash.length > 0

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 dark">
            <Card className="w-full max-w-2xl">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl">
                        📱
                    </div>
                    <CardTitle className="text-2xl">Welcome to Teleapps</CardTitle>
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

                        {/* OpenRouter Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">LLM (OpenRouter)</h3>
                                <span className="text-xs text-muted-foreground">Optional</span>
                            </div>

                            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                                <p className="mb-2">OpenRouter enables AI-powered message triage. To get an API key:</p>
                                <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                                    <li>Go to <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                        openrouter.ai <ExternalLink className="h-3 w-3" />
                                    </a></li>
                                    <li>Create an account or sign in</li>
                                    <li>Go to Keys → Create Key</li>
                                    <li>Copy the key (starts with <code className="text-xs bg-background px-1 rounded">sk-or-</code>)</li>
                                </ol>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    You can skip this and add it later in Settings.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
                                <Input
                                    id="openrouter-key"
                                    type="password"
                                    placeholder="sk-or-..."
                                    value={openrouterKey}
                                    onChange={(e) => setOpenrouterKey(e.target.value)}
                                />
                            </div>

                            {openrouterKey && (
                                <div className="flex items-center gap-2 text-sm text-green-500">
                                    <Check className="h-4 w-4" />
                                    LLM features will be enabled
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
