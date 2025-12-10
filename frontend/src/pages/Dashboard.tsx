import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, AlertCircle, Clock, CheckCircle, Loader2 } from 'lucide-react'
import { getLatestReport, generateReport } from '@/lib/api'
import type { Status, Report, ReportItem } from '@/lib/types'

interface DashboardProps {
    status: Status | null
}

export function Dashboard({ status }: DashboardProps) {
    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)

    const loadReport = async () => {
        try {
            const result = await getLatestReport()
            setReport(result.report)
        } catch (e) {
            console.error('Failed to load report:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadReport()
    }, [])

    const handleGenerateReport = async () => {
        setGenerating(true)
        try {
            await generateReport()
            // Report will be reloaded when job completes
        } catch (e) {
            console.error('Failed to generate report:', e)
        } finally {
            setGenerating(false)
        }
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <div className="p-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Conversations</CardDescription>
                        <CardTitle className="text-3xl">{status?.conversations_count ?? '-'}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Unread Messages</CardDescription>
                        <CardTitle className="text-3xl text-primary">{status?.unread_count ?? '-'}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Last Caught Up</CardDescription>
                        <CardTitle className="text-lg">
                            {status?.caught_up_at ? formatDate(status.caught_up_at) : 'Never'}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>LLM Status</CardDescription>
                        <CardTitle className="text-lg">
                            {status?.llm_enabled ? (
                                <span className="text-green-500">Enabled</span>
                            ) : (
                                <span className="text-muted-foreground">Disabled</span>
                            )}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Latest Report */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Latest Report
                        </CardTitle>
                        {report?.data && (
                            <CardDescription>
                                Generated {formatDate(report.data.generated_at)} • Covers since {formatDate(report.data.covers_since)}
                            </CardDescription>
                        )}
                    </div>
                    <Button
                        onClick={handleGenerateReport}
                        disabled={generating || !status?.llm_enabled}
                        variant="outline"
                    >
                        {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate New Report
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : report?.data ? (
                        <ScrollArea className="h-[400px]">
                            <div className="space-y-6">
                                <ReportSection
                                    title="Reply Now"
                                    icon={<AlertCircle className="h-4 w-4 text-destructive" />}
                                    items={report.data.sections.reply_now}
                                    urgency="high"
                                />
                                <Separator />
                                <ReportSection
                                    title="Review"
                                    icon={<Clock className="h-4 w-4 text-amber-500" />}
                                    items={report.data.sections.review}
                                    urgency="medium"
                                />
                                <Separator />
                                <ReportSection
                                    title="Low Priority"
                                    icon={<CheckCircle className="h-4 w-4 text-green-500" />}
                                    items={report.data.sections.low_priority}
                                    urgency="low"
                                />
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                            <p>No reports yet.</p>
                            {status?.llm_enabled ? (
                                <p className="text-sm">Click "Generate New Report" to analyze your conversations.</p>
                            ) : (
                                <p className="text-sm">Enable LLM in Settings to generate AI-powered reports.</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function ReportSection({
    title,
    icon,
    items,
    urgency
}: {
    title: string
    icon: React.ReactNode
    items: ReportItem[]
    urgency: 'high' | 'medium' | 'low'
}) {
    if (items.length === 0) {
        return null
    }

    const badgeVariant = urgency === 'high' ? 'destructive' : urgency === 'medium' ? 'warning' : 'success'

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                {icon}
                <h3 className="font-semibold">{title}</h3>
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
            </div>
            <div className="space-y-2">
                {items.map((item) => (
                    <div key={item.conversation_uuid} className="rounded-lg border bg-card p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="font-medium">{item.display_name}</div>
                                {item.username && (
                                    <div className="text-sm text-muted-foreground">@{item.username}</div>
                                )}
                            </div>
                            <Badge variant={badgeVariant}>{item.urgency_score}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                        <p className="mt-1 text-xs italic text-muted-foreground">{item.reasoning}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
