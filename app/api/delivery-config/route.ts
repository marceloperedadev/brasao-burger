import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadDeliveryConfig } from '@/lib/delivery-zones'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Delivery configuration is unavailable.' }, { status: 503 })
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    const config = await loadDeliveryConfig(supabase)
    return NextResponse.json({ config }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Could not load delivery configuration.', error)
    return NextResponse.json({ error: 'Delivery configuration is unavailable.' }, { status: 503 })
  }
}
