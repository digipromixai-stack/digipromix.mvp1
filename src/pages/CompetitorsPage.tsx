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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competitors</h1>
          <p className="text-gray-500 text-sm mt-1">{competitors.length} competitor{competitors.length !== 1 ? 's' : ''} monitored</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Add Competitor
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No competitors yet"
          description="Add your first competitor to start monitoring their website for changes."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add Competitor
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} />
          ))}
        </div>
      )}

      <CompetitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
