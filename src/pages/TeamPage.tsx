import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Trash2, Crown } from 'lucide-react'
import { supabase, invokeFunction } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'
import type { OrganizationMember, OrgRole } from '../types/database.types'

const roleLabel: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
const statusVariant = { pending: 'warning', active: 'success', removed: 'default' } as const

export function TeamPage() {
  const { businessId, role } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)

  const canManage = role === 'owner' || role === 'admin'

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ['organization', businessId],
    queryFn: async () => {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', businessId!)
        .maybeSingle()
      return data
    },
    enabled: !!businessId,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['organization_members', org?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', org!.id)
        .neq('status', 'removed')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as OrganizationMember[]
    },
    enabled: !!org?.id,
  })

  const upgrade = useMutation({
    mutationFn: async () => {
      const { error } = await invokeFunction('upgrade-to-team-plan', {})
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization'] })
      toast('Upgraded to the Team plan', 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await invokeFunction('remove-team-member', { member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization_members'] })
      toast('Teammate removed', 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  if (orgLoading) return <PageSpinner />

  if (!org || org.plan !== 'team') {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <Card>
          <CardContent>
            <EmptyState
              icon={Users}
              title="Upgrade to the Team plan"
              description="Invite teammates to work inside your business account with Owner, Admin, and Member roles."
              action={
                <Button onClick={() => upgrade.mutate()} loading={upgrade.isPending}>
                  Upgrade to Team plan
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus size={16} /> Invite teammate
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Members</h2></CardHeader>
        <CardContent>
          {membersLoading ? (
            <PageSpinner />
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500">No teammates yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {m.role === 'owner' && <Crown size={16} className="text-warning shrink-0" />}
                    <span className="text-sm font-medium text-gray-900 truncate">{m.email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="info">{roleLabel[m.role]}</Badge>
                    <Badge variant={statusVariant[m.status]}>{m.status}</Badge>
                    {canManage && m.role !== 'owner' && (
                      <button
                        onClick={() => removeMember.mutate(m.id)}
                        disabled={removeMember.isPending}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-danger hover:bg-red-tint transition-colors"
                        aria-label={`Remove ${m.email}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />}
    </div>
  )
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await invokeFunction('invite-team-member', { email: email.trim(), role })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization_members'] })
      toast('Invite sent', 'success')
      setEmail('')
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <Modal open={open} onClose={onClose} title="Invite a teammate" description="They'll get an email invite and share your business data once they sign in.">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); invite.mutate() }}
      >
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          options={[
            { value: 'member', label: 'Member — regular access' },
            { value: 'admin', label: 'Admin — can manage the team' },
          ]}
        />
        <Button type="submit" fullWidth loading={invite.isPending}>Send invite</Button>
      </form>
    </Modal>
  )
}
