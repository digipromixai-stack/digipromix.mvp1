import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useAddMonitoredPage } from '../../hooks/useMonitoredPages'
import type { PageType } from '../../types/database.types'

const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'blog', label: 'Blog' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'custom', label: 'Custom' },
]

const schema = z.object({
  url: z.string().url('Enter a valid URL'),
  page_type: z.enum(['home', 'pricing', 'promotions', 'blog', 'landing_page', 'custom']),
})
type FormData = z.infer<typeof schema>

export function AddPageForm({ open, onClose, competitorId }: { open: boolean; onClose: () => void; competitorId: string }) {
  const addPage = useAddMonitoredPage()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { page_type: 'custom' },
  })

  async function onSubmit(data: FormData) {
    await addPage.mutateAsync({ ...data, competitor_id: competitorId })
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Monitored Page">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Page URL"
          id="url"
          placeholder="https://competitor.com/pricing"
          error={errors.url?.message}
          {...register('url')}
        />
        <Select
          label="Page type"
          id="page_type"
          options={PAGE_TYPES}
          {...register('page_type')}
        />
        {addPage.error && <p className="text-sm text-red-600">{addPage.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Add page</Button>
        </div>
      </form>
    </Modal>
  )
}
