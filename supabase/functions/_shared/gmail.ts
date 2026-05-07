/**
 * Gmail API helper — sends email via Google's Gmail REST API (users.messages.send).
 *
 * Requires these Supabase secrets:
 *   GMAIL_CLIENT_ID      — OAuth client ID (Web application)
 *   GMAIL_CLIENT_SECRET  — OAuth client secret
 *   GMAIL_REFRESH_TOKEN  — Long-lived refresh token (obtained once via OAuth)
 *   GMAIL_FROM_ADDRESS   — Sender Gmail address (must match the authorised account)
 *
 * On every send:
 *   1. Exchange refresh_token → fresh access_token (Google's /token endpoint)
 *   2. Build RFC 2822 MIME message
 *   3. base64url encode it
 *   4. POST to gmail.googleapis.com/gmail/v1/users/me/messages/send
 */

interface SendArgs {
  to:      string
  subject: string
  html:    string
  text?:   string
  fromName?: string
}

/** Convert a UTF-8 string to base64url (RFC 4648) — what Gmail API expects */
function base64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  // Build standard base64 first
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function getAccessToken(): Promise<string> {
  const clientId     = Deno.env.get('GMAIL_CLIENT_ID')
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials not configured (need GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token refresh failed: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.access_token as string
}

/** Build an RFC 2822 MIME message with HTML + plain-text parts */
function buildRfc2822(args: SendArgs, fromAddress: string): string {
  const fromHeader = args.fromName ? `${args.fromName} <${fromAddress}>` : fromAddress
  const boundary   = '----=_DigiPromix_' + crypto.randomUUID().replace(/-/g, '')
  const text       = args.text ?? args.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  return [
    `From: ${fromHeader}`,
    `To: ${args.to}`,
    `Subject: =?UTF-8?B?${base64url(args.subject).replace(/-/g, '+').replace(/_/g, '/')}=?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    args.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/**
 * Send an email via Gmail API.
 * Returns the Gmail message ID on success, throws on failure.
 */
export async function sendGmailEmail(args: SendArgs): Promise<string> {
  const fromAddress = Deno.env.get('GMAIL_FROM_ADDRESS')
  if (!fromAddress) throw new Error('GMAIL_FROM_ADDRESS not configured')

  const accessToken = await getAccessToken()
  const raw         = base64url(buildRfc2822(args, fromAddress))

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  const data = await res.json()
  if (!res.ok) {
    const errMsg = data?.error?.message ?? JSON.stringify(data).slice(0, 200)
    throw new Error(`Gmail send failed (HTTP ${res.status}): ${errMsg}`)
  }
  return data.id as string
}
