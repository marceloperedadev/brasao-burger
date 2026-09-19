import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* =========================================================
   SUPABASE — CONFIGURAÇÃO DO SERVIDOR
   ========================================================= */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL não configurada.'
  )
}

if (!supabaseSecretKey) {
  throw new Error(
    'SUPABASE_SECRET_KEY não configurada.'
  )
}

/*
 * Este cliente existe somente no servidor.
 * A chave secreta NÃO deve ser exposta ao navegador.
 */
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/* =========================================================
   TIPOS
   ========================================================= */

type CustomerInput = {
  name: string
  phone: string
  deliveryMethod: 'delivery' | 'pickup'
  address: string
  number: string
  complement?: string
  neighborhood: string
  reference?: string
}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

/**
 * Limpa qualquer valor recebido da requisição.
 */
function clean(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

/**
 * Mantém somente números no telefone.
 *
 * Exemplo:
 * (12) 99970-93459
 *
 * vira:
 * 129997093459
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Normaliza a forma de entrega recebida no body.
 *
 * Qualquer valor ausente ou inesperado cai em
 * 'delivery' — o padrão mais seguro, já que exige
 * endereço (mantém a validação antiga como
 * comportamento padrão para chamadas que não
 * informarem este campo).
 */
function normalizeDeliveryMethod(
  value: unknown
): 'delivery' | 'pickup' {
  return value === 'pickup'
    ? 'pickup'
    : 'delivery'
}

/**
 * Monta os dados que serão enviados ao Supabase.
 */
function buildCustomer(
  body: Partial<CustomerInput>
): CustomerInput {
  return {
    name: clean(body.name),

    phone: normalizePhone(
      clean(body.phone)
    ),

    deliveryMethod:
      normalizeDeliveryMethod(
        body.deliveryMethod
      ),

    address: clean(body.address),

    number: clean(body.number),

    complement: clean(
      body.complement
    ),

    neighborhood: clean(
      body.neighborhood
    ),

    reference: clean(
      body.reference
    ),
  }
}

/* =========================================================
   VALIDAÇÃO
   ========================================================= */

function validateCustomer(
  customer: CustomerInput
): string | null {
  if (!customer.name) {
    return 'Nome é obrigatório.'
  }

  if (customer.phone.length < 10) {
    return 'WhatsApp inválido.'
  }

  /*
   * Endereço só é exigido para pedidos de
   * ENTREGA. Para RETIRADA, o cliente só
   * precisa de nome e WhatsApp.
   */
  if (
    customer.deliveryMethod ===
    'delivery'
  ) {
    if (!customer.address) {
      return 'Endereço é obrigatório.'
    }

    if (!customer.number) {
      return 'Número é obrigatório.'
    }

    if (!customer.neighborhood) {
      return 'Bairro é obrigatório.'
    }
  }

  return null
}

/* =========================================================
   GET — BUSCAR CLIENTE PELO WHATSAPP
   ========================================================= */

export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url)

    const phone = normalizePhone(
      searchParams.get('phone') ?? ''
    )

    /* -----------------------------------------------------
       VALIDAR TELEFONE
       ----------------------------------------------------- */

    if (phone.length < 10) {
      return NextResponse.json(
        {
          error:
            'WhatsApp inválido.',
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       BUSCAR CLIENTE
       ----------------------------------------------------- */

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('customers')
      .select(
        `
        id,
        name,
        phone,
        address,
        number,
        complement,
        neighborhood,
        reference
        `
      )
      .eq(
        'phone',
        phone
      )
      .maybeSingle()

    /* -----------------------------------------------------
       ERRO SUPABASE
       ----------------------------------------------------- */

    if (error) {
      console.error(
        'Erro ao buscar cliente no Supabase:',
        error
      )

      /*
       * Não devolvemos detalhes internos
       * do Supabase para o navegador.
       */
      return NextResponse.json(
        {
          error:
            'Não foi possível consultar o cadastro.',
        },
        {
          status: 500,
        }
      )
    }

    /* -----------------------------------------------------
       CLIENTE NÃO ENCONTRADO
       ----------------------------------------------------- */

    if (!data) {
      return NextResponse.json(
        {
          customer: null,
        },
        {
          status: 200,
        }
      )
    }

    /* -----------------------------------------------------
       CLIENTE ENCONTRADO
       ----------------------------------------------------- */

    return NextResponse.json(
      {
        customer: data,
      },
      {
        status: 200,
      }
    )
  } catch (error) {
    console.error(
      'Erro inesperado ao buscar cliente:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    )
  }
}

/* =========================================================
   POST — CRIAR OU ATUALIZAR CLIENTE
   ========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* -----------------------------------------------------
       LER BODY
       ----------------------------------------------------- */

    const body =
      (await request.json()) as Partial<CustomerInput>

    /* -----------------------------------------------------
       NORMALIZAR DADOS
       ----------------------------------------------------- */

    const customer =
      buildCustomer(body)

    /* -----------------------------------------------------
       VALIDAR DADOS
       ----------------------------------------------------- */

    const validationError =
      validateCustomer(customer)

    if (validationError) {
      return NextResponse.json(
        {
          error:
            validationError,
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       PROCURAR CLIENTE PELO TELEFONE
       ----------------------------------------------------- */

    const {
      data: existingCustomer,
      error: searchError,
    } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq(
        'phone',
        customer.phone
      )
      .maybeSingle()

    if (searchError) {
      console.error(
        'Erro ao procurar cliente:',
        searchError
      )

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar o cadastro.',
        },
        {
          status: 500,
        }
      )
    }

    /* =====================================================
       ATUALIZAR CLIENTE EXISTENTE
       ===================================================== */

    if (existingCustomer) {
      /*
       * Em pedidos de RETIRADA o endereço não é
       * pedido nem validado — então, se o cliente
       * já tem um endereço salvo de uma compra
       * anterior, não queremos sobrescrevê-lo com
       * campos vazios só porque este pedido não
       * os enviou. Só atualizamos o endereço
       * quando é uma ENTREGA, ou quando um
       * endereço de fato foi enviado no payload.
       */
      const shouldUpdateAddress =
        customer.deliveryMethod ===
          'delivery' ||
        Boolean(customer.address)

      const updatePayload: Record<
        string,
        unknown
      > = {
        name: customer.name,

        updated_at:
          new Date().toISOString(),
      }

      if (shouldUpdateAddress) {
        updatePayload.address =
          customer.address

        updatePayload.number =
          customer.number

        updatePayload.complement =
          customer.complement ||
          null

        updatePayload.neighborhood =
          customer.neighborhood

        updatePayload.reference =
          customer.reference ||
          null
      }

      const {
        data,
        error,
      } = await supabaseAdmin
        .from('customers')
        .update(updatePayload)
        .eq(
          'id',
          existingCustomer.id
        )
        .select(
          `
          id,
          name,
          phone,
          address,
          number,
          complement,
          neighborhood,
          reference
          `
        )
        .single()

      /* ---------------------------------------------------
         ERRO AO ATUALIZAR
         --------------------------------------------------- */

      if (error) {
        console.error(
          'Erro ao atualizar cliente:',
          error
        )

        return NextResponse.json(
          {
            error:
              'Não foi possível atualizar o cadastro.',
          },
          {
            status: 500,
          }
        )
      }

      /* ---------------------------------------------------
         RETORNO — CLIENTE ATUALIZADO
         --------------------------------------------------- */

      return NextResponse.json(
        {
          customer: data,
          created: false,
        },
        {
          status: 200,
        }
      )
    }

    /* =====================================================
       CRIAR NOVO CLIENTE
       ===================================================== */

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('customers')
      .insert({
        name:
          customer.name,

        phone:
          customer.phone,

        address:
          customer.address,

        number:
          customer.number,

        complement:
          customer.complement ||
          null,

        neighborhood:
          customer.neighborhood,

        reference:
          customer.reference ||
          null,
      })
      .select(
        `
        id,
        name,
        phone,
        address,
        number,
        complement,
        neighborhood,
        reference
        `
      )
      .single()

    /* -----------------------------------------------------
       ERRO AO CRIAR
       ----------------------------------------------------- */

    if (error) {
      console.error(
        'Erro ao criar cliente:',
        error
      )

      return NextResponse.json(
        {
          error:
            'Não foi possível cadastrar o cliente.',
        },
        {
          status: 500,
        }
      )
    }

    /* -----------------------------------------------------
       RETORNO — CLIENTE CRIADO
       ----------------------------------------------------- */

    return NextResponse.json(
      {
        customer: data,
        created: true,
      },
      {
        status: 201,
      }
    )
  } catch (error) {
    console.error(
      'Erro inesperado ao salvar cliente:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    )
  }
}