
// =========================================================
// BRASÃO BURGER — CONFIGURAÇÃO DO SITE
// =========================================================

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
    number: '5512991234567',

    general:
      'https://wa.me/5512991234567?text=Ol%C3%A1!%20Quero%20fazer%20um%20pedido%20no%20Bras%C3%A3o%20Burger.',

    menu:
      'https://wa.me/5512991234567?text=Ol%C3%A1!%20Quero%20ver%20o%20card%C3%A1pio%20do%20Bras%C3%A3o%20Burger.',

    quickOrder:
      'https://wa.me/5512991234567?text=Ol%C3%A1!%20Quero%20fazer%20um%20pedido%20r%C3%A1pido%20no%20Bras%C3%A3o%20Burger.',
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
    pixKey: undefined,

    pixKeyType: undefined,

    accepted: [
      {
        id: 'pix',
        label: 'Pix',
      },

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
