import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

// =========================================================
// SITE CONFIG — BRASÃO BURGER
// =========================================================

const SITE_URL = 'https://brasao-burger.vercel.app'
const SITE_NAME = 'Brasão Burger'

const SITE_DESCRIPTION =
  'O verdadeiro hambúrguer na parrilla em Taubaté. Ingredientes selecionados, molhos artesanais, porções rústicas e o melhor chope trincando da praça.'

const OG_IMAGE = '/images/brasao-fachada.jpg'

// =========================================================
// METADATA
// =========================================================

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default:
      'Brasão Burger | Hambúrguer Artesanal na Parrilla em Taubaté',
    template: '%s | Brasão Burger',
  },

  description: SITE_DESCRIPTION,

  keywords: [
    'Brasão Burger',
    'Brasao Burger',
    'hambúrguer Taubaté',
    'hambúrguer artesanal Taubaté',
    'hambúrguer na parrilla Taubaté',
    'hamburgueria Taubaté',
    'hamburgueria artesanal Taubaté',
    'burger artesanal Taubaté',
    'burger na parrilla',
    'hambúrguer artesanal',
    'hamburgueria Centro Taubaté',
    'lanche Taubaté',
    'porções Taubaté',
    'chope Taubaté',
    'delivery hambúrguer Taubaté',
    'melhor hambúrguer Taubaté',
  ],

  authors: [
    {
      name: SITE_NAME,
    },
  ],

  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME,

  category: 'food',

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  alternates: {
    canonical: '/',
  },

  // =======================================================
  // OPEN GRAPH
  // =======================================================

  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,

    title:
      'Brasão Burger | Hambúrguer Artesanal na Parrilla em Taubaté',

    description:
      'O verdadeiro hambúrguer na parrilla em Taubaté. Ingredientes selecionados, molhos artesanais, porções rústicas e chope trincando.',

    images: [
      {
        url: OG_IMAGE,
        width: 1024,
        height: 1024,
        alt:
          'Brasão Burger — Hambúrguer Artesanal na Parrilla em Taubaté',
      },
    ],
  },

  // =======================================================
  // TWITTER / X
  // =======================================================

  twitter: {
    card: 'summary_large_image',

    title:
      'Brasão Burger | Hambúrguer Artesanal na Parrilla em Taubaté',

    description:
      'Hambúrguer artesanal na parrilla, ingredientes selecionados, molhos artesanais, porções rústicas e chope trincando em Taubaté.',

    images: [OG_IMAGE],
  },

  // =======================================================
  // ROBOTS
  // =======================================================

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // =======================================================
  // ICONS
  // =======================================================

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#090807',
}

// =========================================================
// ROOT LAYOUT
// =========================================================

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // =======================================================
  // STRUCTURED DATA — BRASÃO BURGER
  // =======================================================

  const jsonLd = {
    '@context': 'https://schema.org',

    '@type': 'Restaurant',

    '@id': `${SITE_URL}/#restaurant`,

    name: SITE_NAME,

    description: SITE_DESCRIPTION,

    url: SITE_URL,

    image: `${SITE_URL}${OG_IMAGE}`,

    telephone: '+5512991234567',

    address: {
      '@type': 'PostalAddress',

      streetAddress: 'Praça Santa Teresinha, 42',

      addressLocality: 'Taubaté',

      addressRegion: 'SP',

      postalCode: '12020-100',

      addressCountry: 'BR',
    },

    areaServed: {
      '@type': 'City',
      name: 'Taubaté',
    },

    sameAs: [
      'https://www.instagram.com/brasaoburguer_/',
    ],

    servesCuisine: [
      'Hambúrguer',
      'Hambúrguer artesanal',
      'Churrasco',
      'Lanches',
    ],

    priceRange: '$$',

    menu: 'https://wa.me/5512991234567',

    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',

        dayOfWeek: [
          'Tuesday',
          'Wednesday',
          'Thursday',
        ],

        opens: '18:00',
        closes: '23:00',
      },

      {
        '@type': 'OpeningHoursSpecification',

        dayOfWeek: [
          'Friday',
          'Saturday',
        ],

        opens: '18:00',
        closes: '23:30',
      },

      {
        '@type': 'OpeningHoursSpecification',

        dayOfWeek: ['Sunday'],

        opens: '18:00',
        closes: '23:00',
      },
    ],
  }

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      </head>

      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
