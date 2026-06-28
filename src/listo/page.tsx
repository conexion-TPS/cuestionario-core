'use client'
import { useEffect, useState } from 'react'
import { useHost } from '../host'

type Resultado = {
  perfil_base:         string
  confianza:           string
  puntaje_a:           number
  puntaje_b:           number
  rasgos_comerciales:  Record<string, number>
  deseabilidad_social: boolean
}

const PERFILES: Record<string, { nombre: string; icon: string; color: string; desc: string }> = {
  E: {
    nombre: 'Energético',
    icon:   '🦅',
    color:  '#e8440a',
    desc:   'Alta iniciativa + enfoque en resultados y tareas. Tu fortaleza: apertura activa de oportunidades y cierre con determinación.',
  },
  S: {
    nombre: 'Sociable',
    icon:   '🦚',
    color:  '#d4a017',
    desc:   'Alta iniciativa + alta calidez. Tu fortaleza: networking natural y capacidad de generar entusiasmo en cada interacción.',
  },
  R: {
    nombre: 'Relacional',
    icon:   '🕊️',
    color:  '#1f6f56',
    desc:   'Alta calidez + estilo consultivo. Tu fortaleza: construcción de confianza profunda y retención de clientes a largo plazo.',
  },
  A: {
    nombre: 'Reflexivo',
    icon:   '🦉',
    color:  '#3a5da8',
    desc:   'Alta precisión + análisis detallado. Tu fortaleza: conocimiento técnico y capacidad de generar confianza con prospectos analíticos.',
  },
  AMB: {
    nombre: 'Ambivertido',
    icon:   '🔄',
    color:  '#6b45c8',
    desc:   'Puntuaciones intermedias en ambos ejes. Estadísticamente, los ambivertidos superan a los extremos en producción.',
  },
}

const FACTORES: Record<string, string> = {
  f1: 'Iniciativa Comercial',
  f2: 'Orientación al Cliente',
  f3: 'Disciplina de Proceso',
  f4: 'Estabilidad bajo Presión',
  f5: 'Apertura al Aprendizaje',
}

export default function ListoPage() {
  const { getSession, loading: authLoading, navigate, onExit, onAuthNeeded } = useHost()
  const session = getSession()
  const router = { push: navigate, replace: navigate }
  const [resultado, setResultado] = useState<Resultado | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!session) { onAuthNeeded(); return }

    const stored = localStorage.getItem('tps_perfil_resultado')
    if (stored) {
      setResultado(JSON.parse(stored))
    } else {
      router.replace('/cuestionario')
    }
  }, [authLoading, session])

  if (!resultado) return <div style={{ minHeight: '100vh', background: '#f5f3ef' }} />

  const info = PERFILES[resultado.perfil_base] ?? PERFILES['AMB']
  const confianzaColor = resultado.confianza === 'Alta' ? '#1f6f56' : resultado.confianza === 'Media' ? '#a8691a' : '#8a8885'

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0b0a09', padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evaluación TPS</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>Tu perfil conductual</div>
      </div>

      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 480, margin: '0 auto', width: '100%' }}>

        {/* Tarjeta de perfil */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '28px 22px', border: '1px solid #e8e6e3', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{info.icon}</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: '#0b0a09', marginBottom: 6 }}>
            {info.nombre}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
            background: `${confianzaColor}18`, borderRadius: 20, padding: '4px 14px',
            border: `1px solid ${confianzaColor}40` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: confianzaColor, display: 'inline-block' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: confianzaColor }}>
              Confianza {resultado.confianza}
            </span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4844', margin: 0 }}>
            {info.desc}
          </p>
        </div>

        {/* Ejes */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 18px', border: '1px solid #e8e6e3', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8885', marginBottom: 14 }}>Ejes principales</div>
          {[
            { label: 'Iniciativa', val: resultado.puntaje_a, max: 4 },
            { label: 'Calidez',    val: resultado.puntaje_b, max: 4 },
          ].map(({ label, val, max }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 12, color: '#8a8885', fontFamily: 'var(--font-mono), monospace' }}>
                  {val.toFixed(2)} / {max}
                </span>
              </div>
              <div style={{ height: 8, background: '#f5f3ef', borderRadius: 4 }}>
                <div style={{ height: '100%', background: '#cbf135', borderRadius: 4, width: `${(val / max) * 100}%`, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Rasgos comerciales */}
        {resultado.rasgos_comerciales && Object.keys(resultado.rasgos_comerciales).length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '18px 18px', border: '1px solid #e8e6e3', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8885', marginBottom: 14 }}>Rasgos comerciales</div>
            {Object.entries(resultado.rasgos_comerciales).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{FACTORES[k] ?? k}</span>
                  <span style={{ fontSize: 12, color: '#8a8885', fontFamily: 'var(--font-mono), monospace' }}>{v}/25</span>
                </div>
                <div style={{ height: 8, background: '#f5f3ef', borderRadius: 4 }}>
                  <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.6s ease',
                    background: v >= 20 ? '#cbf135' : v >= 15 ? '#a8cc1a' : '#e8e6e3',
                    width: `${(v / 25) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <button onClick={onExit} style={{ display: 'block', width: '100%', padding: '15px 0', background: '#cbf135', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, textAlign: 'center', textDecoration: 'none', color: '#0b0a09', marginTop: 8, marginBottom: 32, cursor: 'pointer', fontFamily: 'inherit' }}>
          Ir al feed →
        </button>

      </div>
    </div>
  )
}
