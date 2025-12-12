import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  MessageSquare,
  FileText,
  Send,
  Settings,
  RefreshCw,
  CheckCheck,
  Loader2,
  Users
} from 'lucide-react'
import { getStatus, triggerSync, markCaughtUp, checkConfig } from '@/lib/api'
import type { Status, Job } from '@/lib/types'
import { SetupWizard } from '@/components/SetupWizard'
import { AuthDialog } from '@/components/AuthDialog'
import { Dashboard } from '@/pages/Dashboard'
import { Conversations } from '@/pages/Conversations'
import { Participants } from '@/pages/Participants'
import { Reports } from '@/pages/Reports'
import { BulkSend } from '@/pages/BulkSend'
import { SettingsPage } from '@/pages/Settings'

function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [tab, setTab] = useState('dashboard')

  // Track if we've done initial sync on this page load
  const hasInitialSyncRun = useRef(false)

  const loadStatus = useCallback(async (checkAuth = false) => {
    try {
      const s = await getStatus()
      setStatus(s)

      // Only set needsAuth on initial load, not on refreshes
      // This prevents a race condition where the dialog reopens
      // after successful auth before the session is fully registered
      if (checkAuth && !s.telegram_connected) {
        setNeedsAuth(true)
      }
    } catch (e) {
      console.error('Failed to load status:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const checkSetup = useCallback(async () => {
    try {
      const result = await checkConfig()
      if (!result.configured) {
        setNeedsSetup(true)
        setLoading(false)
      } else {
        loadStatus(true) // Check auth on initial load
      }
    } catch {
      // If check fails, try loading status directly
      loadStatus(true) // Check auth on initial load
    }
  }, [loadStatus])

  useEffect(() => {
    checkSetup()
  }, [checkSetup])

  // Trigger sync when Telegram connects for the first time on this page load
  useEffect(() => {
    if (status?.telegram_connected && !hasInitialSyncRun.current && !needsSetup && !needsAuth) {
      hasInitialSyncRun.current = true
      triggerSync().catch(e => console.error('Initial sync failed:', e))
    }
  }, [status?.telegram_connected, needsSetup, needsAuth])

  // WebSocket for job updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'job_update') {
        setActiveJob(data.job)
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          setTimeout(() => {
            setActiveJob(null)
            loadStatus()
          }, 2000)
        }
      }
    }

    ws.onerror = () => {
      console.log('WebSocket error, will retry...')
    }

    ws.onclose = () => {
      setTimeout(() => {
        // Reconnect logic would go here
      }, 3000)
    }

    return () => ws.close()
  }, [loadStatus])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await triggerSync()
    } catch (e) {
      console.error('Sync failed:', e)
    } finally {
      setSyncing(false)
    }
  }

  const handleCaughtUp = async () => {
    try {
      await markCaughtUp()
      loadStatus()
    } catch (e) {
      console.error('Failed to mark caught up:', e)
    }
  }

  const handleSetupComplete = () => {
    setNeedsSetup(false)
    loadStatus(true) // Check auth after setup completes
  }

  const handleAuthComplete = () => {
    setNeedsAuth(false)
    loadStatus()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (needsSetup) {
    return <SetupWizard onComplete={handleSetupComplete} />
  }

  return (
    <div className="flex h-screen flex-col bg-background dark">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-xl">
              📱
            </div>
            <div>
              <h1 className="text-xl font-bold">Teleapps</h1>
              <p className="text-xs text-muted-foreground">
                {status?.conversations_count ?? 0} conversations • {status?.unread_count ?? 0} unread
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="ml-2">Sync</span>
            </Button>
            <Button variant="default" size="sm" onClick={handleCaughtUp}>
              <CheckCheck className="h-4 w-4" />
              <span className="ml-2">Caught Up</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Job Progress */}
      {activeJob && (
        <div className="border-b bg-muted/50 px-6 py-2">
          <div className="flex items-center gap-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{activeJob.progress_message || `${activeJob.type}...`}</span>
            {activeJob.progress_total > 0 && (
              <Progress
                value={(activeJob.progress_current / activeJob.progress_total) * 100}
                className="flex-1 h-2"
              />
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-6">
          <TabsList className="h-12 bg-transparent">
            <TabsTrigger value="dashboard" className="gap-2">
              <FileText className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="conversations" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversations
            </TabsTrigger>
            <TabsTrigger value="participants" className="gap-2">
              <Users className="h-4 w-4" />
              Participants
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="bulk-send" className="gap-2">
              <Send className="h-4 w-4" />
              Bulk Send
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="dashboard" className="m-0 h-full">
            <Dashboard status={status} />
          </TabsContent>
          <TabsContent value="conversations" className="m-0 h-full">
            <Conversations />
          </TabsContent>
          <TabsContent value="participants" className="m-0 h-full">
            <Participants />
          </TabsContent>
          <TabsContent value="reports" className="m-0 h-full">
            <Reports />
          </TabsContent>
          <TabsContent value="bulk-send" className="m-0 h-full">
            <BulkSend />
          </TabsContent>
          <TabsContent value="settings" className="m-0 h-full">
            <SettingsPage status={status} onRefresh={loadStatus} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Auth Dialog */}
      <AuthDialog open={needsAuth} onComplete={handleAuthComplete} />
    </div>
  )
}

export default App
