import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trocas e Reembolsos',
  description: 'Política de trocas e reembolsos do Burger do Bairro.',
}

export default function TrocasReembolsosPage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px 96px', color: '#f6efe7' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: 24 }}>Trocas e Reembolsos</h1>

      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        A <strong>Burger do Bairro</strong> busca oferecer a melhor experiência ao cliente,
        mas a política de trocas e reembolsos pode variar conforme o produto, a forma de entrega
        e a natureza do problema identificado.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>1. Pedidos com erro de produção</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Caso o produto seja entregue em condições diferentes do solicitado, o cliente pode solicitar
        atendimento imediato pela loja para avaliação e solução.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>2. Trocas</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Trocas serão analisadas conforme a existência de erro no pedido, falha no atendimento ou divergência
        com o solicitado.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>3. Reembolsos</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Reembolsos poderão ser concedidos apenas quando houver inconsistência comprovada no pedido,
        erro de entrega ou falha de atendimento previamente verificada pela loja.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>4. Contato</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Para solicitar troca ou reembolso, contate a loja pelo WhatsApp ou pelo e-mail
        contato@burgerdobairro.com.br.
      </p>
    </main>
  )
}
