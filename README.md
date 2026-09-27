# Brasão Burger

Site institucional e cardápio com carrinho e checkout. O pedido é gravado no Supabase antes de o cliente ser encaminhado ao WhatsApp. A autenticação Google é opcional e serve para guardar dados do cliente.

## Requisitos

- Node.js compatível com Next.js 16
- Projeto Supabase
- Catálogo `public.categories` e `public.products` criado e preenchido no Supabase (gerenciado externamente; este repositório ainda não contém migração ou seed do catálogo)

O catálogo precisa expor os campos consultados por `app/page.tsx` e `app/cardapio/page.tsx`: categorias `id`, `name`, `slug`, `sort_order`, `active`; produtos `id`, `category_id`, `name`, `description`, `price`, `image_url`, `featured`, `available`, `sort_order`. A RPC de pedidos também consulta `products.available` e `products.price`.

## Configuração local

Copie `.env.example` para `.env.local` e preencha as variáveis. Nunca exponha `SUPABASE_SECRET_KEY` no navegador nem a envie ao Git.

```bash
npm install
npm run dev
```

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública publishable (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | Chave secreta apenas no servidor para persistência de pedidos (ou `SUPABASE_SERVICE_ROLE_KEY`) |

A configuracao de entrega usa `public.delivery_settings` e `public.delivery_zones`. A migration 004 introduziu a tarifa fixa de teste; as migrations `202609260005_configure_delivery_zones.sql` e `202609260006_extend_delivery_zone_rules.sql` preservam os campos legados e preparam cinco zonas por bairro, todas inicialmente inativas e sem precos. A migration `202609260007_enforce_order_delivery_fee_minimum.sql` garante no banco taxa minima de R$ 5,00 para entrega e taxa zero para retirada. Nenhum valor ou bairro comercial e presumido. A entrega permanece bloqueada ate que as zonas, tarifas, cidade/UF e o estado de configuracao sejam definidos. O servidor usa o bairro retornado pelo ViaCEP, recalcula a zona e o frete e valida a area antes de aceitar um pedido.

## Proteção contra abuso de pedidos

`POST /api/orders` é público para permitir pedidos de convidados e não implementa rate limit distribuído no processo Next.js. Antes de publicar, configure no provedor de hospedagem/WAF uma regra de limitação para essa rota, baseada no IP de origem validado pelo próprio provedor (não em um `X-Forwarded-For` enviado livremente pelo cliente). Defina e ajuste os limites conforme o volume legítimo do estabelecimento, monitore respostas `429` e confirme que tráfego normal de clientes não é bloqueado. Não use contador em memória como proteção de produção em execução serverless/multinstância.

## Banco Supabase

As migrations em `supabase/migrations` criam as tabelas de pedidos/itens e perfis de cliente, alem da funcao `create_order_atomic`.

Antes de aplicar qualquer migration, confirme o projeto vinculado e compare o historico local com o remoto (`supabase migration list`). Nao execute `supabase db push` enquanto o historico remoto e o plano de alteracoes nao tiverem sido revisados e reconciliados; este repositorio nao confirma o estado atual do banco de producao.

A migração de proteção do checkout `202609260002_checked_order_creation.sql` também deve ser aplicada depois da migração de pedidos. Ela serializa requisições com a mesma chave de idempotência e compara preço e disponibilidade com o catálogo antes de criar o pedido. Publique a alteração da aplicação somente depois de aplicar essa migração no projeto Supabase correto.

Confirme o project ref antes de vincular/aplicar. A criação do catálogo (`categories` e `products`) continua sendo uma configuração externa deste projeto; confira o esquema descrito acima e cadastre os produtos no Supabase antes de publicar o cardápio.

## Login Google opcional

Ative Google em **Supabase Dashboard → Authentication → Providers**, informe as credenciais OAuth fornecidas pelo cliente e configure os domínios de produção e desenvolvimento em **URL Configuration** (Site URL e Redirect URLs). A tela de retorno usada pelo app é `/cardapio?oauth=google`. Credenciais OAuth não fazem parte do repositório.

## Dados comerciais a confirmar

Confirme com o cliente o WhatsApp, endereço, horários, perfil do Instagram, domínio/URL pública, formas de pagamento e eventual chave PIX. Os valores atuais ficam principalmente em `app/config/site.ts` e `app/layout.tsx`; este README não os trata como validados. O PIX está sem chave e não está listado entre os pagamentos aceitos. Verifique também o link `sameAs` do JSON-LD no layout, que deve corresponder ao Instagram aprovado.

## Validação

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Essas verificações não substituem um pedido de homologação: teste catálogo, taxas, persistência, login se habilitado e redirecionamento ao WhatsApp com dados aprovados antes da operação real.

## Deploy e operação

Configure as variáveis no ambiente de produção, incluindo `NEXT_PUBLIC_SITE_URL` com o domínio público aprovado. Mantenha `SUPABASE_SECRET_KEY` apenas no servidor. Antes do deploy, confirme DNS e HTTPS e valide no provedor/WAF a regra de rate limit para `POST /api/orders`, incluindo resposta `429`.

O checkout grava o pedido antes de abrir o WhatsApp. Este projeto não inclui painel administrativo, histórico público nem rota de consulta operacional de pedidos. Se a resposta se perder ou o WhatsApp não abrir, não há neste app um fluxo para a loja localizar e recuperar esse pedido; defina um procedimento restrito a operadores antes do lançamento. Não use uma chave pública do Supabase para contornar as permissões de leitura de pedidos.

A retirada usa taxa zero. A entrega fica bloqueada até que cidade/UF, zonas, tarifas e estado de configuração sejam aprovados e configurados no Supabase. PIX aparece como meio de pagamento, mas não há chave PIX cadastrada; confirme a operação comercial antes de aceitar esse meio.

## Rotas e código

- `/` — página institucional
- `/cardapio` — catálogo, carrinho e checkout
- `POST /api/orders` — valida e grava o pedido de forma atômica e idempotente
- `GET|POST /api/customer` — consulta e grava o perfil do usuário autenticado
- `app/config/site.ts` — dados comerciais e pagamentos
- `lib/delivery-zones.ts` — configuração, resolução e cálculo das zonas de entrega
