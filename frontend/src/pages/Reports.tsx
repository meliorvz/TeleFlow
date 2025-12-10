import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Calendar, Eye, Loader2 } from 'lucide-react'
import { getReports, getReport, generateReport } from '@/lib/api'
import type { Report } from '@/lib/types'
import { PageLayout } from '@/components/PageLayout'

export function Reports() {
    const [reports, setReports] = useState<Report[]>([])
    const [selectedReport, setSelectedReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [generating, setGenerating] = useState(false)

    const loadReports = async () => {
        try {
            const result = await getReports()
            setReports(result.reports)
        } catch (e) {
            console.error('Failed to load reports:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadReports()
    }, [])

    const handleViewReport = async (id: number) => {
        setLoadingDetail(true)
        try {
            const result = await getReport(id)
            setSelectedReport(result.report)
        } catch (e) {
            console.error('Failed to load report:', e)
        } finally {
            setLoadingDetail(false)
        }
    }

    const handleGenerate = async () => {
        setGenerating(true)
        try {
            await generateReport()
            // Will refresh when job completes
        } catch (e) {
            console.error('Failed to generate:', e)
        } finally {
            setGenerating(false)
        }
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <PageLayout variant="full">
            {/* Reports List */}
            <div className="w-80 border-r flex flex-col">
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="font-semibold">Reports</h2>
                    <Button size="sm" onClick={handleGenerate} disabled={generating}>
                        {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        New
                    </Button>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))
                        ) : reports.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                <p className="text-sm">No reports yet</p>
                            </div>
                        ) : (
                            reports.map((report) => (
                                <button
                                    key={report.id}
                                    onClick={() => handleViewReport(report.id)}
                                    className={`w-full text-left p-3 rounded-lg transition-colors ${selectedReport?.id === report.id
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">Report #{report.id}</span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(report.created_at)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Report Detail */}
            <div className="flex-1">
                {loadingDetail ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : selectedReport?.data ? (
                    <ScrollArea className="h-full">
                        <div className="p-6 space-y-6">
                            <div>
                                <h2 className="text-xl font-semibold">Report #{selectedReport.id}</h2>
                                <p className="text-sm text-muted-foreground">
                                    Generated {formatDate(selectedReport.data.generated_at)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Covers activity since {formatDate(selectedReport.data.covers_since)}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Conversations Analyzed</CardDescription>
                                        <CardTitle>{selectedReport.data.stats.total_conversations}</CardTitle>
                                    </CardHeader>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Total Unread</CardDescription>
                                        <CardTitle>{selectedReport.data.stats.total_unread}</CardTitle>
                                    </CardHeader>
                                </Card>
                            </div>

                            {/* Reply Now */}
                            {selectedReport.data.sections.reply_now.length > 0 && (
                                <Card className="border-destructive/50">
                                    <CardHeader>
                                        <CardTitle className="text-destructive flex items-center gap-2">
                                            Reply Now
                                            <Badge variant="destructive">{selectedReport.data.sections.reply_now.length}</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {selectedReport.data.sections.reply_now.map((item) => (
                                            <div key={item.conversation_uuid} className="border rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{item.display_name}</span>
                                                    <Badge variant="destructive">{item.urgency_score}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">{item.summary}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Review */}
                            {selectedReport.data.sections.review.length > 0 && (
                                <Card className="border-amber-500/50">
                                    <CardHeader>
                                        <CardTitle className="text-amber-500 flex items-center gap-2">
                                            Review
                                            <Badge variant="warning">{selectedReport.data.sections.review.length}</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {selectedReport.data.sections.review.map((item) => (
                                            <div key={item.conversation_uuid} className="border rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{item.display_name}</span>
                                                    <Badge variant="warning">{item.urgency_score}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">{item.summary}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Low Priority */}
                            {selectedReport.data.sections.low_priority.length > 0 && (
                                <Card className="border-green-500/50">
                                    <CardHeader>
                                        <CardTitle className="text-green-500 flex items-center gap-2">
                                            Low Priority
                                            <Badge variant="success">{selectedReport.data.sections.low_priority.length}</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {selectedReport.data.sections.low_priority.map((item) => (
                                            <div key={item.conversation_uuid} className="border rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{item.display_name}</span>
                                                    <Badge variant="success">{item.urgency_score}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">{item.summary}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                            <Eye className="mx-auto h-12 w-12 mb-4 opacity-50" />
                            <p>Select a report to view details</p>
                        </div>
                    </div>
                )}
            </div>
        </PageLayout>
    )
}
