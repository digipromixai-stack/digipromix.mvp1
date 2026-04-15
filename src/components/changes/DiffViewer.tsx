import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../ui/Spinner'

interface DiffViewerProps {
  diffStoragePath: string
}

export function DiffViewer({ diffStoragePath }: DiffViewerProps) {
  const { data: diffText, isLoading, isError } = useQuery({
    queryKey: ['diff', diffStoragePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('diffs').download(diffStoragePath)
      if (error) throw error
      return data.text()
    },
    staleTime: Infinity,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg bg-gray-950">
        <Spinner className="h-4 w-4 text-gray-500" />
      </div>
    )
  }

  if (isError || !diffText) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg bg-gray-950 text-gray-500 text-xs">
        Diff not available for this change.
      </div>
    )
  }

  const lines = diffText.split('\n').filter((l) => l !== '')
  const addedCount = lines.filter((l) => l.startsWith('+ ')).length
  const removedCount = lines.filter((l) => l.startsWith('- ')).length

  return (
    <div className="rounded-xl overflow-hidden border border-gray-800">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-950 border-b border-gray-800 text-xs">
        <span className="text-gray-400 font-medium">Diff</span>
        <span className="ml-auto flex items-center gap-3">
          {addedCount > 0 && (
            <span className="text-green-400">
              +{addedCount} added
            </span>
          )}
          {removedCount > 0 && (
            <span className="text-red-400">
              -{removedCount} removed
            </span>
          )}
          <span className="text-gray-600">{lines.length} lines</span>
        </span>
      </div>

      {/* Diff lines */}
      <div className="font-mono text-xs bg-gray-950 text-gray-200 max-h-96 overflow-y-auto">
        {lines.map((line, i) => {
          const isAdded = line.startsWith('+ ')
          const isRemoved = line.startsWith('- ')
          return (
            <div
              key={i}
              className={`flex ${
                isAdded ? 'bg-green-400/10' :
                isRemoved ? 'bg-red-400/10' :
                'hover:bg-white/[0.02]'
              }`}
            >
              {/* Line number */}
              <span className="select-none w-10 shrink-0 text-right pr-3 py-0.5 text-gray-700 border-r border-gray-800 text-[10px] leading-5">
                {i + 1}
              </span>
              {/* Sign column */}
              <span className={`select-none w-6 shrink-0 text-center py-0.5 leading-5 font-bold ${
                isAdded ? 'text-green-400' :
                isRemoved ? 'text-red-400' :
                'text-gray-700'
              }`}>
                {isAdded ? '+' : isRemoved ? '-' : ' '}
              </span>
              {/* Content */}
              <span className={`flex-1 py-0.5 pr-4 leading-5 whitespace-pre-wrap break-all ${
                isAdded ? 'text-green-300' :
                isRemoved ? 'text-red-300' :
                'text-gray-400'
              }`}>
                {isAdded || isRemoved ? line.slice(2) : line.slice(2) || line}
              </span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-950 border-t border-gray-800 text-[10px] text-gray-600">
        <span><span className="text-green-400 font-bold">+</span> Added lines</span>
        <span><span className="text-red-400 font-bold">-</span> Removed lines</span>
        <span className="text-gray-700">Unchanged context</span>
      </div>
    </div>
  )
}
