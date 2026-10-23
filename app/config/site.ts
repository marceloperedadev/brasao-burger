// =========================================================
// BRASÃO BURGER — CONFIGURAÇÃO DO SITE
// =========================================================
// IMPORTANTE: este arquivo contém EXEMPLOS fictícios para deixar o projeto
// funcional enquanto você não define os dados reais do cliente.
// Troque pelos dados reais antes do deploy final.

const WHATSAPP_NUMBER = '5511999999999'

type WhatsAppUrl = `https://wa.me/${string}?text=${string}`

function createWhatsAppUrl(message: string): WhatsAppUrl {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export const SITE_CONFIG = {
  // -------------------------------------------------------
  // MARCA
  // -------------------------------------------------------
  brand: {
    name: 'Burger do Bairro',
    role: 'Hamburgueria Artesanal',

    description:
      'Hambúrgueres artesanais, porções e drinks em um ambiente descontraído para reunir amigos e família.',

    location: 'São José dos Campos - SP',
  },

  // -------------------------------------------------------
  // WHATSAPP
  // -------------------------------------------------------
  whatsapp: {
    number: WHATSAPP_NUMBER,

    general: createWhatsAppUrl('Olá! Quero fazer um pedido no Burger do Bairro.'),

    menu: createWhatsAppUrl('Olá! Quero ver o cardápio do Burger do Bairro.'),

    quickOrder: createWhatsAppUrl('Olá! Quero fazer um pedido rápido no Burger do Bairro.'),
  },

  // -------------------------------------------------------
  // INSTAGRAM
  // -------------------------------------------------------
  social: {
    instagram: 'https://www.instagram.com/burgerdobairro',
  },

  // -------------------------------------------------------
  // LOCALIZAÇÃO
  // -------------------------------------------------------
  location: {
    address: 'Rua das Flores, 123 - Centro',

    city: 'São José dos Campos',

    state: 'SP',
  },

  // -------------------------------------------------------
  // HORÁRIO DE FUNCIONAMENTO
  // -------------------------------------------------------
  openingHours: {
    monday: {
      label: 'Segunda-feira',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    tuesday: {
      label: 'Terça-feira',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    wednesday: {
      label: 'Quarta-feira',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    thursday: {
      label: 'Quinta-feira',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    friday: {
      label: 'Sexta-feira',
      open: '18:00',
      close: '00:30',
      closed: false,
    },

    saturday: {
      label: 'Sábado',
      open: '18:00',
      close: '00:30',
      closed: false,
    },

    sunday: {
      label: 'Domingo',
      open: '18:00',
      close: '22:30',
      closed: false,
    },
  },

  // -------------------------------------------------------
  // PAGAMENTOS
  // -------------------------------------------------------
  payment: {
    accepted: [
      {
        id: 'dinheiro',
        label: 'Dinheiro',
      },

      {
        id: 'cartao',
        label: 'Cartão',
      },

      {
        id: 'pix',
        label: 'Pix',
      },
    ],
  },

  // -------------------------------------------------------
  // SITE / SEO
  // -------------------------------------------------------
  site: {
    title: 'Burger do Bairro | Hambúrguer Artesanal',

    shortTitle: 'Burger do Bairro',

    description:
      'Hamburgueria artesanal com delivery, porções e cardápio completo em São José dos Campos.',

    url: 'https://burgerdobairro.vercel.app',

    locale: 'pt-BR',
  },
} as const
