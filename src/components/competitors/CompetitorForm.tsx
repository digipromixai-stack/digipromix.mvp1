import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useAddCompetitor, useUpdateCompetitor } from '../../hooks/useCompetitors'
import type { Competitor } from '../../types/database.types'

const INDUSTRIES = [
  { value: '', label: 'Select industry...' },
  { value: 'SaaS', label: 'SaaS' },
  { value: 'E-commerce', label: 'E-commerce' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Education', label: 'Education' },
  { value: 'Other', label: 'Other' },
]

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  website_url: z.string().url('Enter a valid URL (include https://)'),
  industry: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface CompetitorFormProps {
  open: boolean
  onClose: () => void
  competitor?: Competitor
}

export function CompetitorForm({ open, onClose, competitor }: CompetitorFormProps) {
  const addMutation = useAddCompetitor()
  const updateMutation = useUpdateCompetitor()
  const isEditing = !!competitor

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', website_url: '', industry: '' },
  })

  useEffect(() => {
    if (competitor) {
      reset({ name: competitor.name, website_url: competitor.website_url, industry: competitor.industry ?? '' })
    } else {
      reset({ name: '', website_url: '', industry: '' })
    }
  }, [competitor, reset])

  async function onSubmit(data: FormData) {
    if (isEditing) {
      await updateMutation.mutateAsync({ id: competitor.id, ...data })
    } else {
      await addMutation.mutateAsync(data)
    }
    onClose()
  }

  const error = addMutation.error?.message ?? updateMutation.error?.message

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Competitor' : 'Add Competitor'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Company name"
          id="name"
          placeholder="Acme Corp"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Website URL"
          id="website_url"
          placeholder="https://acme.com"
          error={errors.website_url?.message}
          {...register('website_url')}
        />
        <Select
          label="Industry"
          id="industry"
          options={INDUSTRIES}
          {...register('industry')}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Add competitor'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
