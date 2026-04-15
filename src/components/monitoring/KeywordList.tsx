import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Tag, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../ui/Toast'

interface Keyword {
  id: string
  keyword: string
  is_active: boolean
  created_at: string
}

export function KeywordList({ competitorId }: { competitorId: string }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [input, setInput] = useState('')

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ['keyword_alerts', competitorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('keyword_alerts')
        .select('*')
        .eq('competitor_id', competitorId)
        .order('created_at', { ascending: false })
      return (data ?? []) as Keyword[]
    },
    enabled: !!competitorId,
  })

  const addKeyword = useMutation({
    mutationFn: async (keyword: string) => {
      const { error } = await supabase.from('keyword_alerts').insert({
        user_id: user!.id,
        competitor_id: competitorId,
        keyword: keyword.toLowerCase().trim(),
      })
      if (error) {
        if (error.code === '23505') throw new Error('Keyword already tracked')
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keyword_alerts', competitorId] })
      setInput('')
      toast('Keyword added — you\'ll be alerted when it appears', 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const deleteKeyword = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('keyword_alerts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keyword_alerts', competitorId] }),
    onError: () => toast('Failed to remove keyword', 'error'),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const kw = input.trim()
    if (!kw || kw.length < 2) return
    addKeyword.mutate(kw)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Tag size={14} className="text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">Keyword Watchlist ({keywords.length})</h3>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. free trial, 50% off, limited time…"
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          maxLength={80}
        />
        <button
          type="submit"
          disabled={!input.trim() || addKeyword.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {addKeyword.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {/* Keyword chips */}
      {isLoading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : keywords.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">
          No keywords tracked yet. Add keywords to get alerted the moment a competitor mentions them.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span
              key={kw.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium"
            >
              {kw.keyword}
              <button
                onClick={() => deleteKeyword.mutate(kw.id)}
                disabled={deleteKeyword.isPending}
                className="text-blue-400 hover:text-red-500 transition-colors"
                title="Remove keyword"
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
