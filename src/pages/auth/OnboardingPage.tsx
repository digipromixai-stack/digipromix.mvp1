/**
 * Business profile set-up — shown right after registration (and to any
 * account whose profile is incomplete). The AI campaign generator needs this
 * profile, so the app routes here until it is filled in.
 */
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useProfile, isProfileComplete } from '../../hooks/useProfile'
import { useAddCompetitor } from '../../hooks/useCompetitors'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'

const required = (label: string) => z.string().trim().min(1, `${label} is required`)
const url = (label: string) => required(label).refine(
  v => { try { new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return v.includes('.') } catch { return false } },
  `${label} must be a valid web address`,
)
const optionalUrl = z.string().trim().refine(
  v => !v || (() => { try { new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return v.includes('.') } catch { return false } })(),
  'Enter a valid web address',
)

const schema = z.object({
  business_name:            required('Business name'),
  website_url:              url('Website'),
  industry:                 required('Industry'),
  city:                     required('City'),
  main_offer:               required('Main offer'),
  selling_point:            required('Selling point'),
  default_landing_page_url: optionalUrl,
  value_per_lead:           z.number({ error: 'Enter a number' }).min(1, 'Must be at least 1 €'),
  competitor_1:             optionalUrl,
  competitor_2:             optionalUrl,
  competitor_3:             optionalUrl,
})
type FormData = z.infer<typeof schema>

const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`)
const nameFromUrl = (v: string) => {
  const host = new URL(withScheme(v)).hostname.replace(/^www\./, '')
  const label = host.split('.')[0]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function OnboardingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile, isLoading } = useProfile()
  const addCompetitor = useAddCompetitor()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: profile ? {
      business_name:            profile.business_name ?? '',
      website_url:              profile.website_url ?? '',
      industry:                 profile.industry ?? '',
      city:                     profile.city ?? '',
      main_offer:               profile.main_offer ?? '',
      selling_point:            profile.selling_point ?? '',
      default_landing_page_url: profile.default_landing_page_url ?? '',
      value_per_lead:           profile.value_per_lead ?? 80,
      competitor_1: '', competitor_2: '', competitor_3: '',
    } : undefined,
  })

  if (isLoading) return <PageSpinner />
  if (isProfileComplete(profile)) return <Navigate to="/opportunities" replace />

  async function onSubmit(data: FormData) {
    setError('')
    const { error: saveErr } = await supabase.from('profiles').update({
      business_name:            data.business_name,
      website_url:              withScheme(data.website_url),
      industry:                 data.industry,
      city:                     data.city,
      main_offer:               data.main_offer,
      selling_point:            data.selling_point,
      default_landing_page_url: data.default_landing_page_url ? withScheme(data.default_landing_page_url) : null,
      value_per_lead:           data.value_per_lead,
    }).eq('id', user!.id)
    if (saveErr) { setError(saveErr.message); return }

    const competitorUrls = [data.competitor_1, data.competitor_2, data.competitor_3].filter(Boolean)
    for (const c of competitorUrls) {
      try {
        await addCompetitor.mutateAsync({ name: nameFromUrl(c), website_url: withScheme(c), industry: data.industry })
      } catch (e) {
        // A plan limit or duplicate shouldn't block finishing the set-up
        console.warn('Could not add competitor', c, e)
      }
    }

    await qc.invalidateQueries({ queryKey: ['profile'] })
    navigate('/opportunities', { replace: true })
  }

  return (
    <AuthLayout title="Set up your business" subtitle="DigiPromix uses this to write your campaigns">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Business name" id="business_name" placeholder="e.g. Müller Immobilien" error={errors.business_name?.message} {...register('business_name')} />
        <Input label="Website" id="website_url" placeholder="mueller-immobilien.de" error={errors.website_url?.message} {...register('website_url')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Industry" id="industry" placeholder="e.g. Real estate" error={errors.industry?.message} {...register('industry')} />
          <Input label="City" id="city" placeholder="e.g. Berlin" error={errors.city?.message} {...register('city')} />
        </div>
        <Input label="Main offer" id="main_offer" placeholder="e.g. Free property valuation within 48 hours" error={errors.main_offer?.message} {...register('main_offer')} />
        <Input label="Selling point (one sentence)" id="selling_point" placeholder="e.g. No hidden broker fees, local experts since 2005" error={errors.selling_point?.message} {...register('selling_point')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Landing page URL (optional)" id="default_landing_page_url" placeholder="mueller-immobilien.de/angebot" error={errors.default_landing_page_url?.message} {...register('default_landing_page_url')} />
          <Input label="Typical deal value (€)" id="value_per_lead" type="number" error={errors.value_per_lead?.message} {...register('value_per_lead', { valueAsNumber: true })} />
        </div>

        <div className="pt-2">
          <p className="text-sm font-medium text-on-surface mb-1">Competitors to monitor (up to 3, optional)</p>
          <div className="space-y-2">
            <Input id="competitor_1" placeholder="competitor-one.de" error={errors.competitor_1?.message} {...register('competitor_1')} />
            <Input id="competitor_2" placeholder="competitor-two.de" error={errors.competitor_2?.message} {...register('competitor_2')} />
            <Input id="competitor_3" placeholder="competitor-three.de" error={errors.competitor_3?.message} {...register('competitor_3')} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Save and continue
        </Button>
      </form>
    </AuthLayout>
  )
}
