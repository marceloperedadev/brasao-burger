
// =========================================================
// BRASÃO BURGER — CONFIGURAÇÃO DO SITE
// =========================================================

const WHATSAPP_NUMBER = '5512991234567';

type WhatsAppUrl = `https://wa.me/${string}?text=${string}`;

function createWhatsAppUrl(message: string): WhatsAppUrl {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const PIX_KEY: string | undefined = undefined
const PIX_KEY_TYPE: string | undefined = undefined

export const SITE_CONFIG = {
  // -------------------------------------------------------
  // MARCA
  // -------------------------------------------------------
  brand: {
    name: 'Brasão Burger',
    role: 'Hamburgueria Artesanal',

    description:
      'O verdadeiro hambúrguer na parrilla em Taubaté. Ingredientes selecionados, molhos artesanais, porções rústicas e o melhor chope trincando da praça.',

    location: 'Taubaté - SP',
  },

  // -------------------------------------------------------
  // WHATSAPP
  // -------------------------------------------------------
  whatsapp: {
    number: WHATSAPP_NUMBER,

    general: createWhatsAppUrl(
      'Olá! Quero fazer um pedido no Brasão Burger.',
    ),

    menu: createWhatsAppUrl(
      'Olá! Quero ver o cardápio do Brasão Burger.',
    ),

    quickOrder: createWhatsAppUrl(
      'Olá! Quero fazer um pedido rápido no Brasão Burger.',
    ),
  },

  // -------------------------------------------------------
  // INSTAGRAM
  // -------------------------------------------------------
  social: {
    instagram:
      'https://www.instagram.com/brasaoburger.taubate/',
  },

  // -------------------------------------------------------
  // LOCALIZAÇÃO
  // -------------------------------------------------------
  location: {
    address:
      'Praça Santa Teresinha, 42 - Centro, Taubaté - SP, 12020-100',

    city: 'Taubaté',

    state: 'SP',

    zipCode: '12020-100',

    maps:
      'https://www.google.com/maps/search/?api=1&query=Pra%C3%A7a+Santa+Teresinha%2C+42%2C+Centro%2C+Taubat%C3%A9+-+SP',
  },

  // -------------------------------------------------------
  // HORÁRIO DE FUNCIONAMENTO
  // -------------------------------------------------------
  openingHours: {
    monday: {
      label: 'Segunda-feira',
      open: null,
      close: null,
      closed: true,
    },

    tuesday: {
      label: 'Terça-feira',
      open: '18:00',
      close: '23:00',
      closed: false,
    },

    wednesday: {
      label: 'Quarta-feira',
      open: '18:00',
      close: '23:00',
      closed: false,
    },

    thursday: {
      label: 'Quinta-feira',
      open: '18:00',
      close: '23:00',
      closed: false,
    },

    friday: {
      label: 'Sexta-feira',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    saturday: {
      label: 'Sábado',
      open: '18:00',
      close: '23:30',
      closed: false,
    },

    sunday: {
      label: 'Domingo',
      open: '18:00',
      close: '23:00',
      closed: false,
    },
  },

  // -------------------------------------------------------
  // PAGAMENTOS
  // -------------------------------------------------------
  payment: {
    pixKey: PIX_KEY,

    pixKeyType: PIX_KEY_TYPE,

    accepted: [
      {
        id: 'dinheiro',
        label: 'Dinheiro',
      },

      {
        id: 'cartao',
        label: 'Cartão',
      },
    ],
  },

  // -------------------------------------------------------
  // SITE / SEO
  // -------------------------------------------------------
  site: {
    title:
      'Brasão Burger — Hambúrguer na Parrilla em Taubaté',

    shortTitle:
      'Brasão Burger',

    description:
      'O verdadeiro hambúrguer na parrilla em Taubaté. Ingredientes selecionados, molhos artesanais, porções rústicas e o melhor chope da praça.',

    url:
      'https://brasao-burger.vercel.app',

    locale:
      'pt-BR',
  },
} as const
