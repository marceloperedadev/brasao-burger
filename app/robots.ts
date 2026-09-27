import type { MetadataRoute } from 'next'

import { SITE_CONFIG } from './config/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? SITE_CONFIG.site.url

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`,
  }
}
