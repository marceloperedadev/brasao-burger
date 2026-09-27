import type { MetadataRoute } from 'next'

import { SITE_CONFIG } from './config/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_CONFIG.site.url).replace(/\/$/, '')

  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/cardapio`, changeFrequency: 'weekly', priority: 0.8 },
  ]
}
