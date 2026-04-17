import { useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { useCompetitors } from '../hooks/useCompetitors'
import { CompetitorCard } from '../components/competitors/CompetitorCard'
import { CompetitorForm } from '../components/competitors/CompetitorForm'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'

export function CompetitorsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const { data: competitors = [], isLoading } = useCompetitors()
  const activeCount = competitors.filter((c) => c.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Competitors
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {competitors.length} tracked
            {competitors.length > 0 && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="text-emerald-600 font-medium">{activeCount} active</span>
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} fullWidth={false} className="sm:w-auto w-full">
          <Plus size={16} /> Add Competitor
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No competitors yet"
          description="Add your first competitor to start monitoring their website for pricing changes, promotions, and feature updates."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add Competitor
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} />
          ))}
        </div>
      )}

      <CompetitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
