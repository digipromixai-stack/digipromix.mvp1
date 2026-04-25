/**
 * ClientsPage — multi-client / agency support
 * Route: /clients (protected)
 *
 * Lets users manage the businesses / clients they are running campaigns for.
 * Each client can be linked to campaigns (campaign.client_id).
 */

import { useState } from 'react'
import { Building2, Plus, Trash2, Pencil, Globe, FileText, Rocket, Users, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/Toast'
import {
  useClients, useCreateClient, useUpdateClient, useDeleteClient, useClientStats,
} from '../hooks/useClients'
import type { Client } from '../hooks/useClients'

// ── Industry list ─────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Healthcare', 'Real Estate', 'Education', 'Local Services',
  'E-commerce', 'Finance', 'Technology', 'Hospitality',
  'Fitness & Wellness', 'Legal', 'Automotive', 'Food & Beverage', 'Other',
]

// ── Stats chip for each client ────────────────────────────────────────────────

function ClientStatsChip({ clientId }: { clientId: string }) {
  const { data } = useClientStats(clientId)
  if (!data || data.total === 0) return null
  return (
    <div className="flex items-center gap-3 text-xs mt-2">
      <span className="flex items-center gap-1 text-gray-500">
        <Rocket size={11} />{data.total} campaign{data.total !== 1 ? 's' : ''}
      </span>
      {data.active > 0 && (
        <span className="flex items-center gap-1 text-green-600 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          {data.active} active
        </span>
      )}
      {data.leads > 0 && (
        <span className="flex items-center gap-1 text-blue-600 font-medium">
          <Users size={11} />{data.leads} lead{data.leads !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

interface ClientFormProps {
  initial?: Partial<Client>
  onSave: (data: { name: string; industry: string; website: string; notes: string }) => void
  onCancel: () => void
  saving: boolean
}

function ClientForm({ initial, onSave, onCancel, saving }: ClientFormProps) {
  const [name,     setName]     = useState(initial?.name     ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [website,  setWebsite]  = useState(initial?.website  ?? '')
  const [notes,    setNotes]    = useState(initial?.notes    ?? '')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), industry, website: website.trim(), notes: notes.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        label="Client / Business name *"
        id="client-name"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Metro Dental Clinic"
        required
      />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
        <select
          value={industry}
          onChange={e => setIndustry(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select industry…</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <Input
        label="Website"
        id="client-website"
        type="url"
        value={website}
        onChange={e => setWebsite(e.target.value)}
        placeholder="https://example.com"
      />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Key context, goals, budget, etc."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="flex-1">
          <Check size={13} className="mr-1.5" />
          {initial?.id ? 'Save changes' : 'Add client'}
        </Button>
      </div>
    </form>
  )
}

// ── Client card ───────────────────────────────────────────────────────────────

interface ClientCardProps {
  client: Client
  onEdit: (c: Client) => void
}

function ClientCard({ client, onEdit }: ClientCardProps) {
  const { mutate: deleteClient, isPending: deleting } = useDeleteClient()
  const { toast } = useToast()

  const handleDelete = () => {
    if (!confirm(`Delete "${client.name}"? All linked campaigns will be unlinked.`)) return
    deleteClient(client.id, {
      onSuccess: () => toast('Client deleted', 'success'),
    })
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 text-white font-bold text-sm">
            {client.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                {client.industry && (
                  <span className="inline-block mt-0.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {client.industry}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!client.is_active && (
                  <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>
                )}
                <button
                  onClick={() => onEdit(client)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {client.website && (
              <a
                href={client.website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1 truncate"
              >
                <Globe size={11} />{client.website.replace(/^https?:\/\//, '')}
              </a>
            )}

            {client.notes && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 flex items-start gap-1">
                <FileText size={11} className="shrink-0 mt-0.5" />{client.notes}
              </p>
            )}

            <ClientStatsChip clientId={client.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ClientsPage() {
  const { data: clients = [], isLoading } = useClients()
  const { mutate: createClient, isPending: creating } = useCreateClient()
  const { mutate: updateClient, isPending: updating } = useUpdateClient()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Client | null>(null)

  const handleCreate = (data: { name: string; industry: string; website: string; notes: string }) => {
    createClient(data, {
      onSuccess: () => { toast('Client added', 'success'); setShowForm(false) },
    })
  }

  const handleUpdate = (data: { name: string; industry: string; website: string; notes: string }) => {
    if (!editing) return
    updateClient({ id: editing.id, ...data }, {
      onSuccess: () => { toast('Client updated', 'success'); setEditing(null) },
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage the businesses you run campaigns for</p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-1.5" />
            Add client
          </Button>
        )}
      </div>

      {/* Summary stats */}
      {clients.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total clients',  value: clients.length },
            { label: 'Active',         value: clients.filter(c => c.is_active).length },
            { label: 'Industries',     value: new Set(clients.map(c => c.industry).filter(Boolean)).size },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="py-3">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inline add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">New client</h2>
          </CardHeader>
          <CardContent>
            <ClientForm
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              saving={creating}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit modal-inline */}
      {editing && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Edit — {editing.name}</h2>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </CardHeader>
          <CardContent>
            <ClientForm
              initial={editing}
              onSave={handleUpdate}
              onCancel={() => setEditing(null)}
              saving={updating}
            />
          </CardContent>
        </Card>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : clients.length === 0 && !showForm ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client to associate campaigns with specific businesses or accounts."
        />
      ) : (
        <div className="space-y-3">
          {clients.map(c => (
            <ClientCard key={c.id} client={c} onEdit={setEditing} />
          ))}
        </div>
      )}
    </div>
  )
}
