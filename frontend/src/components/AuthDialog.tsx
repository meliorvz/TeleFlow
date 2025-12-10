import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, Lock } from 'lucide-react'
import { authStart, authCode, auth2fa } from '@/lib/api'

interface AuthDialogProps {
    open: boolean
    onComplete: () => void
}

type Step = 'phone' | 'code' | '2fa'

export function AuthDialog({ open, onComplete }: AuthDialogProps) {
    const [step, setStep] = useState<Step>('phone')
    const [phone, setPhone] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const result = await authStart(phone)
            if (result.status === 'already_authorized') {
                onComplete()
            } else {
                setStep('code')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send code')
        } finally {
            setLoading(false)
        }
    }

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const result = await authCode(code)
            if (result.status === '2fa_required') {
                setStep('2fa')
            } else {
                onComplete()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid code')
        } finally {
            setLoading(false)
        }
    }

    const handle2faSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            await auth2fa(password)
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid password')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Connect to Telegram</DialogTitle>
                    <DialogDescription>
                        {step === 'phone' && 'Enter your phone number to log in.'}
                        {step === 'code' && 'Enter the code sent to your Telegram app.'}
                        {step === '2fa' && 'Enter your two-factor authentication password.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'phone' && (
                    <form onSubmit={handlePhoneSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="+1234567890"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Include country code (e.g., +1 for US)
                            </p>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <Button type="submit" className="w-full" disabled={!phone || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Code
                        </Button>
                    </form>
                )}

                {step === 'code' && (
                    <form onSubmit={handleCodeSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">Verification Code</Label>
                            <Input
                                id="code"
                                placeholder="12345"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Check your Telegram app for the code
                            </p>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <Button type="submit" className="w-full" disabled={!code || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Verify
                        </Button>
                    </form>
                )}

                {step === '2fa' && (
                    <form onSubmit={handle2faSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">2FA Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
                            <div className="flex items-center gap-2 text-green-500">
                                <Lock className="h-4 w-4" />
                                <span className="font-medium">Security Note</span>
                            </div>
                            <p className="mt-1 text-muted-foreground">
                                Your password is sent directly to Telegram's servers via encrypted MTProto.
                                Teleapps never stores or logs your password.
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <Button type="submit" className="w-full" disabled={!password || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Login
                        </Button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
