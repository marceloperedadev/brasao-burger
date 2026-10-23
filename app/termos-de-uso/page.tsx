import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de uso do Burger do Bairro.',
}

export default function TermosDeUsoPage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px 96px', color: '#f6efe7' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: 24 }}>Termos de Uso</h1>

      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Ao utilizar este site, o cliente concorda com as condições de uso descritas abaixo.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>1. Objetivo</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        O site tem como finalidade apresentar o cardápio, facilitar a escolha e o pedido,
        e encaminhar a solicitação ao WhatsApp da loja para confirmação do atendimento.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>2. Pedidos</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Os pedidos realizados por meio do site dependem da confirmação da loja e podem ser
        alterados ou cancelados conforme a disponibilidade e a política da operação.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>3. Entrega e pagamentos</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        As condições de entrega, valor do frete, endereço de atendimento e formas de pagamento
        podem variar conforme a localidade e a política vigente da loja.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>4. Uso do site</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        O cliente deve fornecer informações verdadeiras e utilizar o site de maneira responsável,
        sem praticar abuso, fraudes ou qualquer tipo de atividade ilícita.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>5. Alterações</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        A loja pode alterar estes termos a qualquer momento, com as devidas atualizações no site.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>6. Contato</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Se houver dúvidas sobre estes termos, entre em contato com a loja pelo WhatsApp ou pelo
        e-mail: contato@burgerdobairro.com.br
      </p>
    </main>
  )
}
