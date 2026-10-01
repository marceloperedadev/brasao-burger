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
| `ADMIN_USER_IDS` | UUIDs de usuários Supabase Auth autorizados a administrar a loja, separados por vírgula |
| `SUPABASE_STORAGE_BUCKET` | Bucket de imagens otimizadas (padrão `product-images`) |

A configuracao de entrega usa `public.delivery_settings` e `public.delivery_zones`. A migration 004 introduziu a tarifa fixa de teste; as migrations `202609260005_configure_delivery_zones.sql` e `202609260006_extend_delivery_zone_rules.sql` preservam os campos legados e preparam cinco zonas por bairro, todas inicialmente inativas e sem precos. A migration `202609260007_enforce_order_delivery_fee_minimum.sql` garante no banco taxa minima de R$ 5,00 para entrega e taxa zero para retirada. Nenhum valor ou bairro comercial e presumido. A entrega permanece bloqueada ate que as zonas, tarifas, cidade/UF e o estado de configuracao sejam definidos. O servidor usa o bairro retornado pelo ViaCEP, recalcula a zona e o frete e valida a area antes de aceitar um pedido.

## Proteção contra abuso de pedidos

`POST /api/orders` é público para permitir pedidos de convidados e não implementa rate limit distribuído no processo Next.js. Antes de publicar, configure no provedor de hospedagem/WAF uma regra de limitação para essa rota, baseada no IP de origem validado pelo próprio provedor (não em um `X-Forwarded-For` enviado livremente pelo cliente). Defina e ajuste os limites conforme o volume legítimo do estabelecimento, monitore respostas `429` e confirme que tráfego normal de clientes não é bloqueado. Não use contador em memória como proteção de produção em execução serverless/multinstância.

## Banco Supabase

As migrations em `supabase/migrations` criam as tabelas de pedidos/itens e perfis de cliente, alem da funcao `create_order_atomic`.

Antes de aplicar qualquer migration, confirme o projeto vinculado e compare o historico local com o remoto (`supabase migration list`). Nao execute `supabase db push` enquanto o historico remoto e o plano de alteracoes nao tiverem sido revisados e reconciliados; este repositorio nao confirma o estado atual do banco de producao.

A migração de proteção do checkout `202609260002_checked_order_creation.sql` também deve ser aplicada depois da migração de pedidos. Ela serializa requisições com a mesma chave de idempotência e compara preço e disponibilidade com o catálogo antes de criar o pedido. Publique a alteração da aplicação somente depois de aplicar essa migração no projeto Supabase correto.

Confirme o project ref antes de vincular/aplicar. A criação do catálogo (`categories` e `products`) continua sendo uma configuração externa deste projeto; confira o esquema descrito acima e cadastre os produtos no Supabase antes de publicar o cardápio.

## Login Google opcional

Ative Google em **Supabase Dashboard → Authentication → Providers**, informe as credenciais OAuth do estabelecimento e configure **Site URL** e **Redirect URLs** em **Authentication → URL Configuration**. O Site URL deve ser a origem de produção aprovada. Cadastre os destinos exatos usados por este app:

- `http://localhost:3000/cardapio?oauth=google` — retorno do login opcional de cliente em desenvolvimento.
- `http://localhost:3000/admin` — retorno do login administrativo em desenvolvimento.
- `https://<dominio-aprovado>/cardapio?oauth=google` — retorno de cliente em produção.
- `https://<dominio-aprovado>/admin` — retorno administrativo em produção.

Substitua `<dominio-aprovado>` pelo domínio real e mantenha HTTPS em produção. Se o servidor local usar outra porta, cadastre a URL dessa origem também. Não inclua credenciais OAuth no repositório.

## Painel administrativo

O painel fica em `/admin` e usa o login Google do Supabase Auth. Para autorizar
uma conta, adicione o UUID do usuário Auth a `ADMIN_USER_IDS` no ambiente do
servidor; nunca use e-mail ou um valor fornecido pelo navegador como regra de
autorização. Sem UUID autorizado, as APIs administrativas negam acesso. Inclua
`http://localhost:3000/admin` e `https://<dominio-aprovado>/admin` nos Redirect
URLs OAuth do Supabase, substituindo o domínio pelo aprovado.

O painel atual consulta e administra pedidos, produtos, categorias e perfis
salvos por clientes. Não há estoque numérico, solicitações de clientes ou
configurações comerciais em tabelas neste repositório; esses módulos não são
simulados. Pedidos PIX começam como `pending` e a confirmação é manual.

As fotos de produtos são processadas no navegador para WebP (até 1600 px) e
somente o arquivo otimizado é enviado. A migration
`202609300001_create_product_images_bucket.sql` cria o bucket público de leitura
`product-images` se ele não existir; as escritas e remoções passam apenas pela
API autenticada com chave secreta no servidor. Antes de aplicar migrations,
confirme o projeto Supabase e revise o plano. A migration de imagens depende de
`public.categories`, `public.products` e `public.customer_profiles` já
existirem. A migration PIX depende de `202609250001_create_orders.sql` e
`202609260002_checked_order_creation.sql`; a de perfil cliente usa a tabela
criada em `202609260001_create_customer_profiles.sql`. Nenhuma imagem existente
é limpa automaticamente; arquivos antigos fora do caminho
`products/<sha256>.webp` permanecem intocados.

### Preparar o banco do painel

Primeiro confirme o projeto/ref e que o catálogo externo `public.categories` e
`public.products` existe com os campos documentados neste README. No projeto
novo, aplique pelo histórico de migrations, uma vez e nesta ordem:

1. `202609250001_create_orders.sql`
2. `202609260001_create_customer_profiles.sql`
3. `202609260002_checked_order_creation.sql`
4. `202609260003_customer_profile_city_state.sql`
5. `202609260004_create_delivery_settings.sql`
6. `202609260005_configure_delivery_zones.sql`
7. `202609260006_extend_delivery_zone_rules.sql`
8. `202609260007_enforce_order_delivery_fee_minimum.sql`
9. `202609260008_reconcile_delivery_zone_columns.sql`

Depois, para o setup do admin em um banco-base já existente, abra
`supabase/ADMIN_SETUP_COPY_PASTE.sql`, revise o project ref e execute o arquivo
inteiro no SQL Editor do Supabase. Ele adiciona `payment_status`, grants
mínimos e o bucket WebP, após validar as tabelas/colunas. Não rode esse script
e as migrations `202609260009_manual_pix_payment_status.sql` e
`202609300001_create_product_images_bucket.sql` em paralelo. O SQL Editor não
registra o script no histórico do Supabase CLI; antes de usar `db push`, reconcilie
esse estado manualmente. O script aborta se faltar schema ou se `product-images`
já existir privado/incompatível, e não muda essa configuração.

## Pagamentos (PIX no recebimento)

Este aplicativo **não processa pagamento**. Não há integração com gateway,
adquirente ou banco: nada é cobrado, confirmado, conciliado ou estornado
automaticamente. O pedido é gravado, a loja recebe a mensagem no WhatsApp e a
confirmação do pagamento acontece fora do site.

- A lista de meios aceitos fica em `SITE_CONFIG.payment.accepted`
  (`app/config/site.ts`). Essa mesma lista define a ordem exibida no checkout,
  a opção que já vem marcada e o que a API aceita em `POST /api/orders`.
- PIX está cadastrado como meio manual: o cliente paga na retirada ou
  diretamente ao entregador no recebimento. O pedido é gravado com
  `payment_method = 'pix'` e a mensagem do WhatsApp informa onde o pagamento
  será feito. O site não envia chave ou QR Code.
- A situação do pagamento fica em `orders.payment_status`, adicionada pela
  migration `202609260009_manual_pix_payment_status.sql`, com os valores
  `pending`, `confirmed`, `cancelled` e `refunded`. A coluna nasce sempre como
  `pending`: nada no código marca um pedido como pago por causa da forma de
  pagamento escolhida, e a função `create_order_atomic` continua sem escrever
  nessa coluna. A loja confirma o recebimento e muda o estado manualmente.
- A migration é aditiva (coluna com valor padrão e índice por meio de
  pagamento/data); nenhum dado existente é apagado ou reescrito. Aplique-a
  antes de construir qualquer tela administrativa que dependa de
  `payment_status`.

Pendências de pagamento ainda em aberto: painel administrativo, listagem de
pedidos por meio de pagamento, tela dos PIX aguardando confirmação e fluxo de
atualização, cancelamento ou reembolso. Nada disso existe neste repositório.


## Dados comerciais a confirmar

Confirme com o cliente o WhatsApp, endereço, horários, perfil do Instagram, domínio/URL pública e formas de pagamento. Os valores atuais ficam principalmente em `app/config/site.ts` e `app/layout.tsx`; este README não os trata como validados. O PIX está listado como pagamento manual na retirada ou com o entregador — veja **Pagamentos (PIX no recebimento)**. Verifique também o link `sameAs` do JSON-LD no layout, que deve corresponder ao Instagram aprovado. CNPJ/razão social e endereço fiscal continuam sem cadastro no site.

## Pendências conhecidas (não resolvidas neste repositório)

- **Documentos legais ausentes**: não existem páginas de Política de
  Privacidade, Termos de Uso nem Política de Trocas/Reembolso, embora o
  checkout colete nome, WhatsApp, endereço e, opcionalmente, conta Google. O
  texto depende do cliente (CNPJ, razão social, endereço fiscal, canal de
  atendimento, prazos) e não pode ser presumido aqui.
- **Identificação do fornecedor**: não há CNPJ/razão social nem endereço fiscal
  completo publicados (o endereço atual é "Esquina da Praça Santa Terezinha").
- **Painel administrativo**: inexistente. Pedidos, forma de pagamento e
  situação de pagamento só podem ser consultados direto no Supabase.
- **Limite de requisições**: `POST /api/orders` é público e depende de regra no
  provedor/WAF (ver "Proteção contra abuso de pedidos").
- **Textos de marca**: frases como "o melhor chope trincando da praça" são
  conteúdo comercial e precisam de validação do cliente.

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

A retirada usa taxa zero. A entrega fica bloqueada até que cidade/UF, zonas, tarifas e estado de configuração sejam aprovados e configurados no Supabase. O PIX é pago manualmente na retirada ou diretamente ao entregador. A loja precisa confirmar o recebimento no sistema operacional usado pela equipe; este repositório ainda não possui painel administrativo para isso.

## Rotas e código

- `/` — página institucional
- `/cardapio` — catálogo, carrinho e checkout
- `POST /api/orders` — valida e grava o pedido de forma atômica e idempotente
- `GET|POST /api/customer` — consulta e grava o perfil do usuário autenticado
- `app/config/site.ts` — dados comerciais e pagamentos
- `supabase/migrations/202609260009_manual_pix_payment_status.sql` — situação do pagamento (nasce `pending`) e índice por meio de pagamento
- `lib/delivery-zones.ts` — configuração, resolução e cálculo das zonas de entrega
