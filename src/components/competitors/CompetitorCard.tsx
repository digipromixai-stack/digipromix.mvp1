import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MoreVertical, Pencil, Trash2, Globe } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { useDeleteCompetitor } from '../../hooks/useCompetitors'
import { CompetitorForm } from './CompetitorForm'
import { formatUrl } from '../../lib/utils'
import type { Competitor } from '../../types/database.types'

export function CompetitorCard({ competitor }: { competitor: Competitor }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const deleteMutation = useDeleteCompetitor()

  function handleDelete() {
    if (confirm(`Remove ${competitor.name}? This will delete all monitoring data.`)) {
      deleteMutation.mutate(competitor.id)
    }
    setMenuOpen(false)
  }

  return (
    <>
      <Card hover className="hover:border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand shadow-soft shrink-0">
                <Globe size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <Link
                  to={`/competitors/${competitor.id}`}
                  className="text-sm font-semibold text-gray-900 hover:text-blue-600 truncate block"
                >
                  {competitor.name}
                </Link>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <a
                    href={competitor.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1"
                  >
                    {formatUrl(competitor.website_url)}
                    <ExternalLink size={10} />
                  </a>
                  {competitor.industry && (
                    <Badge variant="info">{competitor.industry}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg border border-gray-200 shadow-lg z-10">
                  <button
                    onClick={() => { setEditOpen(true); setMenuOpen(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Badge variant={competitor.is_active ? 'success' : 'default'}>
              {competitor.is_active ? 'Active' : 'Paused'}
            </Badge>
            <span className="text-xs text-gray-400">
              Crawls {competitor.crawl_frequency}
            </span>
          </div>
        </CardContent>
      </Card>
      <CompetitorForm open={editOpen} onClose={() => setEditOpen(false)} competitor={competitor} />
    </>
  )
}
