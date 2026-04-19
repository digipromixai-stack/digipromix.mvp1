import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { ChangeCard } from '../components/changes/ChangeCard'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { Competitor } from '../types/database.types'

export function CompetitorTimelinePage() {
  const { id } = useParams<{ id: string }>()

  const { data: competitor } = useQuery({
    queryKey: ['competitor', id],
    queryFn: async () => {
      const { data } = await supabase.from('competitors').select('*').eq('id', id!).single()
      return data as Competitor | null
    },
    enabled: !!id,
  })

  const { data: changes = [], isLoading } = useDetectedChanges({
    competitorId: id,
    limit: 100,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/timeline"
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Back to timeline"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
            {competitor?.name ?? 'Competitor'} Timeline
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            All changes detected for this competitor
          </p>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : changes.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No changes detected yet"
          description="This competitor hasn't had any changes detected yet."
        />
      ) : (
        <div className="space-y-2.5">
          {changes.map((c) => <ChangeCard key={c.id} change={c} />)}
        </div>
      )}
    </div>
  )
}
