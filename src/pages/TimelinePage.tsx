import { useState } from 'react'
import { Activity } from 'lucide-react'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { ChangeCard } from '../components/changes/ChangeCard'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Select } from '../components/ui/Select'
import type { ChangeType } from '../types/database.types'

const CHANGE_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'price_change', label: 'Price Changes' },
  { value: 'new_landing_page', label: 'New Landing Pages' },
  { value: 'new_blog_post', label: 'New Blog Posts' },
  { value: 'banner_change', label: 'Banner Changes' },
  { value: 'content_change', label: 'Content Changes' },
]

export function TimelinePage() {
  const [changeType, setChangeType] = useState<ChangeType | ''>('')

  const { data: changes = [], isLoading, isError } = useDetectedChanges({
    changeType: changeType || undefined,
    limit: 100,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Timeline</h1>
          <p className="text-gray-500 text-sm mt-1">All detected changes across your competitors</p>
        </div>
        <div className="w-48">
          <Select
            options={CHANGE_TYPE_OPTIONS}
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as ChangeType | '')}
          />
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <EmptyState
          icon={Activity}
          title="Failed to load changes"
          description="Please check your connection and try again."
        />
      ) : changes.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No changes detected yet"
          description="Changes will appear here once competitors are being monitored."
        />
      ) : (
        <div className="space-y-3">
          {changes.map((change) => <ChangeCard key={change.id} change={change} />)}
        </div>
      )}
    </div>
  )
}
