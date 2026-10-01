-- PIX como meio de pagamento MANUAL.
--
-- A loja confirma o recebimento por fora deste aplicativo (WhatsApp). Esta
-- migração apenas prepara o banco para registrar esse estado:
--   * nada é marcado como pago automaticamente;
--   * a criação do pedido continua gravando `pending` (a função
--     create_order_atomic não informa esta coluna, então o valor padrão vale);
--   * nenhum dado existente é apagado ou reescrito.
--
-- Aplicar depois de 202609260002_checked_order_creation.sql.

alter table public.orders
  add column if not exists payment_status text not null default 'pending';

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'confirmed', 'cancelled', 'refunded'));

comment on column public.orders.payment_status is
  'Situacao do pagamento. Sempre nasce como pending: o aplicativo nunca marca um pedido como pago apenas porque o cliente escolheu PIX, dinheiro ou cartao. A confirmacao e manual, feita pela loja.';

-- Operador localiza rapidamente os pedidos por forma de pagamento e data,
-- incluindo os pedidos via PIX aguardando confirmacao.
create index if not exists orders_payment_method_created_at_idx
  on public.orders (payment_method, created_at desc);
