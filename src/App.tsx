import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import { ToastProvider } from './components/ui/Toast'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { CompetitorsPage } from './pages/CompetitorsPage'
import { CompetitorDetailPage } from './pages/CompetitorDetailPage'
import { TimelinePage } from './pages/TimelinePage'
import { CompetitorTimelinePage } from './pages/CompetitorTimelinePage'
import { AlertsPage } from './pages/AlertsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { MetaCallbackPage } from './pages/MetaCallbackPage'
import { GoogleAdsCallbackPage } from './pages/GoogleAdsCallbackPage'
import { LandingPage } from './pages/LandingPage'
import { LeadsPage } from './pages/LeadsPage'
import { InterceptionPage } from './pages/InterceptionPage'
import { ClientsPage } from './pages/ClientsPage'
import { PageSpinner } from './components/ui/Spinner'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { MarketingPage } from './pages/MarketingPage'
import { DocsPage } from './pages/DocsPage'

// Handles all OAuth/email auth redirects to /auth/callback.
// Supports both PKCE flow (?code=...) and implicit flow (#access_token=...).
// Waits for the session to actually materialise (PKCE code exchange is async)
// before deciding whether to send the user to /dashboard or /login.
function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function resolveSession() {
      // 1. Trigger Supabase to parse the URL (handles both ?code= and #access_token=)
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (session) {
        navigate('/dashboard', { replace: true })
        return
      }

      // 2. No session yet — wait briefly for SIGNED_IN event from PKCE exchange
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
        if (cancelled) return
        if (event === 'SIGNED_IN' && s) {
          subscription.unsubscribe()
          navigate('/dashboard', { replace: true })
        }
      })

      // 3. Fallback: after 4 seconds, give up and decide based on final state
      setTimeout(async () => {
        if (cancelled) return
        const { data: { session: finalSession } } = await supabase.auth.getSession()
        subscription.unsubscribe()
        if (cancelled) return

        // If URL contains an OAuth error, surface it
        const params = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const oauthError = params.get('error_description') || hashParams.get('error_description')
        if (oauthError) {
          console.error('OAuth error:', oauthError)
        }

        navigate(finalSession ? '/dashboard' : '/login', { replace: true })
      }, 4000)
    }

    resolveSession()
    return () => { cancelled = true }
  }, [navigate])

  return <PageSpinner />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return <PageSpinner />

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <MarketingPage />} />
      <Route path="/docs" element={<DocsPage />} />

      {/* Auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/meta/callback" element={<MetaCallbackPage />} />
      <Route path="/auth/google-ads/callback" element={<GoogleAdsCallbackPage />} />
      {/* Public landing page — no auth */}
      <Route path="/lp/:slug" element={<LandingPage />} />

      {/* Protected app routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/competitors" element={<CompetitorsPage />} />
        <Route path="/competitors/:id" element={<CompetitorDetailPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/timeline/:id" element={<CompetitorTimelinePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/interception" element={<InterceptionPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
