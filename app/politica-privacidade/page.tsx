import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Política de privacidade e uso de dados do Burger do Bairro.',
}

export default function PoliticaPrivacidadePage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px 96px', color: '#f6efe7' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: 24 }}>Política de Privacidade</h1>

      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        A <strong>Burger do Bairro</strong> valoriza a privacidade dos seus clientes.
        Este site coleta apenas as informações necessárias para processar pedidos,
        realizar entregas e manter o atendimento ao cliente.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>1. Informações coletadas</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Podemos coletar dados como nome, telefone, endereço de entrega, informações
        de pedido, e, quando necessário, dados de autenticação para acesso ao painel
        administrativo.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>2. Uso das informações</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Os dados são utilizados para confirmar pedidos, preparar o atendimento,
        encaminhar pedidos ao WhatsApp, melhorar a experiência do cliente e manter a
        operação da loja.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>3. Compartilhamento</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        As informações não são vendidas ou compartilhadas com terceiros, exceto quando
        necessário para a operação do serviço, processamento de pagamentos ou suporte
        de infraestrutura autorizada.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>4. Segurança</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Adotamos medidas de segurança razoáveis para proteger os dados coletados, mas
        nenhum sistema é totalmente imune a riscos digitais.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>5. Direitos do cliente</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        O cliente pode solicitar acesso, correção ou exclusão de seus dados, conforme
        a legislação aplicável e a disponibilidade da operação.
      </p>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>6. Contato</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 16 }}>
        Para dúvidas ou solicitações relacionadas à privacidade, entre em contato com
        a loja pelo WhatsApp ou pelo e-mail: contato@burgerdobairro.com.br
      </p>
    </main>
  )
}
