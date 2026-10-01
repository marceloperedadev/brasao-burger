'use client'

import Image from 'next/image'
import Link from 'next/link'
import styles from './BioHero.module.css'
import { SITE_CONFIG } from '@/app/config/site'

const DATA = {
  name: 'Brasão Burger',
  category: 'Hambúrguer • Parrilla • Bar',
  headline: 'Sabor que merece seu nome.',
  description:
    'O verdadeiro hambúrguer na parrilla em Taubaté. Ingredientes selecionados, molhos artesanais, porções rústicas e chope trincando.',
  address: 'Esquina da Praça Santa Terezinha — Taubaté/SP',

  hours: {
    monday: 'Seg · 18h às 00h',
    weekday: 'Ter — Qui · 18h às 00h',
    friday: 'Sex — Sáb · 18h às 02h',
    sunday: 'Dom · 18h às 00h',
  },

  links: {
    menu: '/cardapio',

    // "Fazer pedido" vai direto ao WhatsApp com o pedido pré-redigido. O
    // destino é diferente do "Ver cardápio" acima (navegação interna) e do
    // "Reservar mesa" abaixo (outra mensagem), então as três ações da home
    // deixam de convergir para /cardapio.
    order: SITE_CONFIG.whatsapp.quickOrder,

    reservation: `https://wa.me/${SITE_CONFIG.whatsapp.number}?text=${encodeURIComponent(
      'Olá! Gostaria de reservar uma mesa no Brasão Burger.',
    )}`,
  },
}

export function BioHero() {
  return (
    <section
      className={styles.heroSection}
      aria-labelledby="brasao-hero-title"
    >
      {/* D */}

      <div className={styles.backgroundOverlay} aria-hidden="true" />

      {/* TEXTURA MUITO SUTIL */}
      <div className={styles.grain} aria-hidden="true" />

      {/* DETALHE DOURADO */}
      <div className={styles.goldLine} aria-hidden="true" />

      {/* IDENTIFICAÇÃO DISCRETA */}
      <div className={styles.cornerLabel} aria-hidden="true">
        <span>BRASÃO</span>
        <span>TAUBATÉ · SP</span>
      </div>

      <div className={styles.heroContainer}>

        {/* =====================================================
            ÁREA DA MARCA
            ===================================================== */}
        <div className={styles.brandArea}>

          <span className={styles.brandOverline}>
            Est. Taubaté
          </span>

          <div className={styles.logoComposition}>

            <div className={styles.logoInner}>
              <div className={styles.logoGlow} aria-hidden="true" />

              <Image
                src="/images/logo-brasao.jpg"
                alt={DATA.name}
                width={420}
                height={420}
                priority
                quality={95}
                className={styles.logo}
              />
            </div>

          </div>

          <div className={styles.brandSignature}>
            <span className={styles.signatureLine} />
            <span>Brasão Burger</span>
            <span className={styles.signatureLine} />
          </div>

          <p className={styles.brandTagline}>
            BURGER · PARRILLA · BAR
          </p>

        </div>

        {/* =====================================================
            CONTEÚDO PRINCIPAL
            ===================================================== */}
        <div className={styles.contentArea}>

          <div className={styles.heroContent}>

            <p className={styles.eyebrow}>
              <span
                className={styles.eyebrowDot}
                aria-hidden="true"
              />
              {DATA.category}
            </p>

            <h1
              id="brasao-hero-title"
              className={styles.headline}
            >
              Sabor que
              <br />
              <em>merece</em> seu nome.
            </h1>

            <p className={styles.description}>
              {DATA.description}
            </p>

          </div>

          {/* =================================================
              CARDÁPIO — DESTAQUE
              ================================================= */}
          <div className={styles.featureCard}>

            <div className={styles.featureContent}>

              <div className={styles.featureText}>
                <span className={styles.featureLabel}>
                  Experiência Brasão
                </span>

                <strong>
                  Parrilla, ingredientes selecionados
                  e sabor de verdade.
                </strong>

                <span>
                  Burgers artesanais, porções e bebidas
                  preparadas para uma experiência completa.
                </span>
              </div>

              <Link
                href={DATA.links.menu}
                className={styles.featureAction}
                aria-label="Ver cardápio do Brasão Burger"
                prefetch
              >
                <span>Ver cardápio</span>

                <span
                  className={styles.featureActionArrow}
                  aria-hidden="true"
                >
                  ↗
                </span>
              </Link>

            </div>

          </div>

          {/* =================================================
              AÇÕES
              ================================================= */}
          <div className={styles.actions}>

            <a
              href={DATA.links.order}
              className={styles.primaryAction}
              aria-label="Fazer pedido no Brasão Burger pelo WhatsApp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Fazer pedido</span>

              <span
                className={styles.actionArrow}
                aria-hidden="true"
              >
                →
              </span>
            </a>

            <a
              href={DATA.links.reservation}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryAction}
              aria-label="Reservar mesa no Brasão Burger pelo WhatsApp"
            >
              <span>Reservar mesa</span>

              <span
                className={styles.secondaryArrow}
                aria-hidden="true"
              >
                ↗
              </span>
            </a>

          </div>

          {/* =================================================
              INFORMAÇÕES
              ================================================= */}
          <div className={styles.metaArea}>

            <div
              className={styles.location}
            >
              <span
                className={styles.locationMarker}
                aria-hidden="true"
              >
                <span />
              </span>

              <span className={styles.locationText}>
                {DATA.address}
              </span>

            </div>

            <div className={styles.hours}>

              <span className={styles.hoursLabel}>
                Horários
              </span>

              <div className={styles.hoursList}>
                <span>{DATA.hours.monday}</span>
                <span>{DATA.hours.weekday}</span>
                <span>{DATA.hours.friday}</span>
                <span>{DATA.hours.sunday}</span>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* INDICADOR DISCRETO */}
      <div
        className={styles.scrollIndicator}
        aria-hidden="true"
      >
        <span>Explore</span>
        <i />
      </div>

    </section>
  )
}
