import { useMemo, useState } from 'react'
import './App.css'
import carrierEmailsData from '../data/carrier_emails.json'
import type { CarrierEmail } from './types/email'
import { buildEmailThreads, computeThreadStats } from './services/emailThreading'
import { CarrierConversationsPage } from './components/carrier-conversations/CarrierConversationsPage'
import { CallsPage } from './components/calls/CallsPage'
import { UnifiedConversations } from './components/unified/UnifiedConversations'
import { AgentPage } from './components/agent/AgentPage'
import {
  initializeKnowledgeBase,
  type InitProgress,
  type KnowledgeBaseStatus,
  type KnowledgeBaseSummary,
} from './data/initializeKnowledgeBase'
import { Button, Group, Loader, SegmentedControl, Text } from '@mantine/core'

type AppView = 'agent' | 'unified' | 'calls' | 'emails'

function App() {
  const [view, setView] = useState<AppView>('agent')
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeBaseStatus>('idle')
  const [knowledgeProgress, setKnowledgeProgress] = useState<InitProgress | null>(null)
  const [knowledgeSummary, setKnowledgeSummary] = useState<KnowledgeBaseSummary | null>(null)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)

  const carrierEmails = carrierEmailsData as CarrierEmail[]
  const emailThreads = useMemo(() => buildEmailThreads(carrierEmails), [carrierEmails])
  const threadStats = useMemo(
    () => computeThreadStats(carrierEmails, emailThreads),
    [carrierEmails, emailThreads],
  )

  const knowledgeReady = knowledgeStatus === 'ready'

  async function prepareKnowledgeBase() {
    if (knowledgeStatus === 'loading') return

    setKnowledgeStatus('loading')
    setKnowledgeError(null)

    try {
      const summary = await initializeKnowledgeBase((progress) => {
        setKnowledgeProgress(progress)
      })
      setKnowledgeSummary(summary)
      setKnowledgeStatus('ready')
    } catch (error) {
      console.error('Knowledge base initialization failed:', error)
      setKnowledgeError(
        error instanceof Error ? error.message : 'Knowledge base initialization failed',
      )
      setKnowledgeStatus('error')
    }
  }

  return (
    <div className="full-screen app-shell">
      <Group px="md" py="xs" justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid #eee' }}>
        <Group gap="sm">
          {knowledgeStatus === 'idle' && (
            <Button size="xs" onClick={() => void prepareKnowledgeBase()}>
              Prepare Knowledge Base
            </Button>
          )}
          {knowledgeStatus === 'loading' && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm">
                Preparing… Emails {knowledgeProgress?.emailsLoaded ?? 0}/
                {knowledgeProgress?.emailsTotal ?? 0} · Calls{' '}
                {knowledgeProgress?.callsProcessed ?? 0}/{knowledgeProgress?.callsTotal ?? 0}
              </Text>
            </Group>
          )}
          {knowledgeStatus === 'ready' && (
            <Text size="sm" c="green" fw={500}>
              Knowledge base ready
              {knowledgeSummary?.warnings.length
                ? ` (${knowledgeSummary.warnings.length} warnings)`
                : ''}
            </Text>
          )}
          {knowledgeStatus === 'error' && (
            <Group gap="xs">
              <Text size="sm" c="red">
                {knowledgeError}
              </Text>
              <Button size="xs" variant="light" onClick={() => void prepareKnowledgeBase()}>
                Retry
              </Button>
            </Group>
          )}
        </Group>

        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as AppView)}
          data={[
            { label: 'Agent', value: 'agent' },
            { label: 'Unified', value: 'unified' },
            { label: 'Call Recordings', value: 'calls' },
            { label: 'Carrier Emails', value: 'emails' },
          ]}
        />
      </Group>

      <div hidden={view !== 'agent'}>
        <AgentPage
          knowledgeStatus={knowledgeStatus}
          knowledgeProgress={knowledgeProgress}
          knowledgeReady={knowledgeReady}
          onPrepareKnowledgeBase={() => void prepareKnowledgeBase()}
        />
      </div>
      <div hidden={view !== 'unified'}>
        <UnifiedConversations knowledgeReady={knowledgeReady} />
      </div>
      <div hidden={view !== 'calls'}>
        <CallsPage />
      </div>
      <div hidden={view !== 'emails'}>
        <CarrierConversationsPage threads={emailThreads} stats={threadStats} />
      </div>
    </div>
  )
}

export default App
