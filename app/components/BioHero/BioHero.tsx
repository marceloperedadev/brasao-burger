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
  address:
    'Praça Santa Teresinha, 42 — Centro, Taubaté, SP',

  hours: {
    monday: 'Seg · Fechado',
    weekday: 'Ter — Qui · 18h às 23h',
    friday: 'Sex — Sáb · 18h às 23h30',
    sunday: 'Dom · 18h às 23h',
  },

  links: {
    menu: '/cardapio',
    order: SITE_CONFIG.whatsapp.menu,

    reservation:
      'https://wa.me/5512991234567?text=Ol%C3%A1%2C%20gostaria%20de%20reservar%20uma%20mesa%20no%20Bras%C3%A3o%20Burger.',

    location:
      'https://www.google.com/maps/search/?api=1&query=Pra%C3%A7a+Santa+Teresinha%2C+42%2C+Centro%2C+Taubat%C3%A9%2C+SP',
  },
}

export function BioHero() {
  return (
    <section
      className={styles.heroSection}
      aria-labelledby="brasao-hero-title"
    >
      {/* FOTO DE FUNDO */}
      <div className={styles.heroBackground} aria-hidden="true">
        <Image
          src="/images/brasao-fachada.jpg"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className={styles.backgroundImage}
        />
      </div>

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
              <span className={styles.eyebrowDot} aria-hidden="true" />
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
              target="_blank"
              rel="noopener noreferrer"
              className={styles.primaryAction}
              aria-label="Fazer pedido pelo WhatsApp"
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

            <a
              href={DATA.links.location}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.location}
              aria-label="Ver localização do Brasão Burger no Google Maps"
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

              <span
                className={styles.locationArrow}
                aria-hidden="true"
              >
                ↗
              </span>
            </a>

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