'use client'
import { useEffect, useState, useRef } from 'react'
import { useHost } from '../host'

const LIKERT = [
  { v: 1, label: 'Muy en desacuerdo' },
  { v: 2, label: 'En desacuerdo' },
  { v: 3, label: 'Neutro' },
  { v: 4, label: 'De acuerdo' },
  { v: 5, label: 'Muy de acuerdo' },
]
const GRUPO = 5  // ítems por pantalla

type Item = { id: string; texto: string }

export default function ModuloC() {
  const { getSession, loading: authLoading, navigate, apiGet, apiPost, onExit, onAuthNeeded } = useHost()
  const session = getSession()
  const api = { get: apiGet, post: apiPost }
  const router = { push: navigate, replace: navigate }
  const guardarProgresoTps = (_a: string, progress: number) => apiPost('/api/cuestionario/progreso', { progress })
  const [items,      setItems]      = useState<Item[]>([])
  const [grupo,      setGrupo]      = useState(0)    // 0–4 (5 grupos de 5)
  const [respuestas, setRespuestas] = useState<Record<string, number>>({})
  const [guardando,  setGuardando]  = useState(false)
  // Consentimiento §5.5 (capa 3 — SOLO captura del dato sensible f4; independiente de
  // términos [capa 1] y de A/B [capa 2]). undefined=cargando, null=aún no decide, true/false=decidido.
  // Gobierna SOLO si f4 se persiste, vía el flag `consentimiento` del payload a tps-evaluar.
  const [consentChoice, setConsentChoice] = useState<boolean | null | undefined>(undefined)

  useEffect(() => {
    if (authLoading) return
    if (!session) { onAuthNeeded(); return }

    const preguntas = JSON.parse(localStorage.getItem('tps_preguntas') || 'null')
    if (!preguntas?.C?.length) { router.replace('/cuestionario'); return }

    const sesion   = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    const prevResp = sesion.respuestas_c || {}
    const cs = sesion.consentimiento_sensible
    setConsentChoice(cs === true || cs === false ? cs : null)

    setItems(preguntas.C.map((p: any) => ({ id: p.id, texto: p.texto })))
    setRespuestas(prevResp)

    // Retomar desde el grupo donde quedó
    const respondidas = Object.keys(prevResp).length
    const grupoInicial = Math.floor(respondidas / GRUPO)
    setGrupo(Math.min(grupoInicial, Math.ceil(preguntas.C.length / GRUPO) - 1))
  }, [authLoading, session])

  const totalGrupos = Math.ceil(items.length / GRUPO)
  const itemsGrupo  = items.slice(grupo * GRUPO, (grupo + 1) * GRUPO)
  const grupoCompleto = itemsGrupo.every(it => respuestas[it.id] !== undefined)
  const progreso    = ((grupo * GRUPO + itemsGrupo.filter(it => respuestas[it.id] !== undefined).length) / items.length) * 100

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Autosave server-side con debounce 2500ms (silencioso si falla: localStorage ya guardó).
  function programarAutosave(cuestionario_id: string | undefined, respuestasModulo: Record<string, any>) {
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(async () => {
      try {
        if (!cuestionario_id) return
        const respuestas = Object.entries(respuestasModulo)
          .map(([pregunta_id, val]) => ({ pregunta_id, respuesta: String(val) }))
        if (!respuestas.length) return
        await api.post('/api/cuestionario/progreso-modulos', { cuestionario_id, respuestas })
      } catch { /* silencioso */ }
    }, 2500)
  }

  function setRespuesta(id: string, valor: number) {
    const nuevas = { ...respuestas, [id]: valor }
    setRespuestas(nuevas)

    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    sesion.respuestas_c = nuevas
    localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
    programarAutosave(sesion.cuestionario_id, nuevas)
  }

  function avanzar() {
    if (!grupoCompleto) return
    if (grupo < totalGrupos - 1) {
      if (session) guardarProgresoTps(session.asesor, 50 + Math.round(((grupo + 1) / totalGrupos) * 35))
      setGrupo(g => g + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      if (session) guardarProgresoTps(session.asesor, 85)
      router.push('/cuestionario/d')
    }
  }

  function salir() {
    if (session) guardarProgresoTps(session.asesor, 50 + Math.round((grupo / totalGrupos) * 35))
    onExit()
  }

  async function guardarYSalir() {
    if (guardando) return
    setGuardando(true)
    try {
      const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
      if (sesion.cuestionario_id && Object.keys(respuestas).length) {
        const filas = Object.entries(respuestas).map(([pregunta_id, val]) => ({ pregunta_id, respuesta: String(val) }))
        await api.post('/api/cuestionario/progreso-modulos', { cuestionario_id: sesion.cuestionario_id, respuestas: filas })
      }
    } catch { /* best-effort */ }
    setTimeout(() => onExit(), 2000)
  }

  // Persiste la decisión §5.5 en la sesión local (la lee cuestionario/d al enviar a tps-evaluar).
  function decidirConsentimiento(valor: boolean) {
    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    sesion.consentimiento_sensible = valor
    localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
    setConsentChoice(valor)
  }

  // Cargando (ítems o decisión de consentimiento aún sin resolver)
  if (!items.length || consentChoice === undefined) return <div style={{ minHeight: '100vh', background: '#f5f3ef' }} />
  // Gate §5.5: si aún no decidió, mostrar la pantalla ANTES de cualquier ítem f4 del Módulo C
  if (consentChoice === null) return <PantallaConsentimiento onDecidir={decidirConsentimiento} />

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0b0a09', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evaluación TPS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>Módulo C — Rasgos Comerciales</div>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono), monospace' }}>
            {grupo + 1}/{totalGrupos}
          </div>
        </div>
        <button onClick={salir} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, padding: '0 0 8px', textDecoration: 'underline',
        }}>
          Guardar y retomar más tarde
        </button>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#cbf135', borderRadius: 2, width: `${progreso}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 16px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a8885', marginBottom: 16, textAlign: 'center' }}>
          ¿Qué tan de acuerdo estás con cada afirmación?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {itemsGrupo.map((item) => (
            <div key={item.id} style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', border: `1px solid ${respuestas[item.id] ? '#cbf135' : '#e8e6e3'}` }}>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: '#0b0a09', margin: '0 0 16px' }}>
                {item.texto}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {LIKERT.map(({ v, label }) => {
                  const sel = respuestas[item.id] === v
                  return (
                    <button key={v} onClick={() => setRespuesta(item.id, v)}
                      title={label}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8,
                        background: sel ? '#cbf135' : '#f5f3ef',
                        border: `1.5px solid ${sel ? '#a8cc1a' : '#e8e6e3'}`,
                        fontSize: 13, fontWeight: 800, cursor: 'pointer',
                        color: sel ? '#0b0a09' : '#8a8885',
                        transition: 'all 0.12s', fontFamily: 'inherit',
                      }}>
                      {v}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 14, color: '#000' }}>Muy en desacuerdo</span>
                <span style={{ fontSize: 14, color: '#000' }}>Muy de acuerdo</span>
              </div>
            </div>
          ))}
        </div>

        <button onClick={avanzar} disabled={!grupoCompleto} style={{
          width: '100%', marginTop: 24, padding: '15px 0',
          background: grupoCompleto ? '#cbf135' : '#e8e6e3',
          border: 'none', borderRadius: 12,
          fontSize: 15, fontWeight: 800, cursor: grupoCompleto ? 'pointer' : 'not-allowed',
          color: grupoCompleto ? '#0b0a09' : '#8a8885',
          transition: 'all 0.2s', fontFamily: 'inherit',
          marginBottom: 32,
        }}>
          {grupo < totalGrupos - 1 ? 'Continuar →' : 'Ir al último módulo →'}
        </button>
        <button onClick={guardarYSalir} disabled={guardando} style={{
          marginTop: 8, width: '100%', padding: '13px 0',
          background: guardando ? '#1d6fd4' : '#fff',
          border: `1.5px solid ${guardando ? '#1d6fd4' : '#d1cec9'}`,
          borderRadius: 12, fontSize: 14, fontWeight: 600,
          cursor: guardando ? 'not-allowed' : 'pointer',
          color: guardando ? '#fff' : '#6b6865',
          transition: 'all 0.2s', fontFamily: 'inherit',
          marginBottom: 32,
        }}>
          {guardando ? '✓ Guardado' : 'Guardar y retomar más tarde'}
        </button>
      </div>
    </div>
  )
}

// ── Pantalla §3.1 — Consentimiento §5.5 (captura del dato sensible f4) ──────────
// Capa 3, independiente: NO escribe en consentimiento_historial (A/B) ni legal_aceptaciones.
// Switch arranca NEUTRO (sw=null): el asesor debe elegir activamente verde/rojo para continuar.
function PantallaConsentimiento({ onDecidir }: { onDecidir: (valor: boolean) => void }) {
  const [sw, setSw] = useState<boolean | null>(null) // null=neutro, true=verde, false=rojo

  const trackBg = sw === true ? '#a8cc1a' : sw === false ? '#e0726a' : '#d8d4ce'
  const knobX   = sw === true ? 26 : sw === false ? 3 : 14 // verde→derecha, rojo→izquierda, neutro→centro

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      {/* Header consistente con el resto del cuestionario */}
      <div style={{ background: '#0b0a09', padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evaluación TPS</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>Tu perfil de desarrollo</div>
      </div>

      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '24px 22px', border: '1px solid #e8e6e3' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: '#0b0a09', margin: '0 0 16px' }}>
            Tu perfil de desarrollo
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4844', margin: '0 0 12px' }}>
            Algunas preguntas miran cómo te sostienes ante el rechazo: la negativa del cliente es parte del día a día en ventas.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4844', margin: '0 0 12px' }}>
            Son para tu desarrollo: nos permiten darte un coaching de calidad, ajustado a ti, no consejos genéricos.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4844', margin: '0 0 12px' }}>
            Esto es tuyo. No se comparte con tu supervisor ni aparece en informes de gestión.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4844', margin: '0 0 20px' }}>
            Tú decides si lo activas. Sin ello, usas la plataforma en versión básica.
          </p>

          {/* Switch neutro → verde/rojo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px', border: '1px solid #e8e6e3', borderRadius: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setSw(s => (s === null ? true : !s))}
              aria-label="Activar mi perfil de desarrollo"
              style={{ width: 48, height: 28, borderRadius: 99, cursor: 'pointer', position: 'relative',
                flexShrink: 0, background: trackBg, border: 'none', transition: 'background 0.2s', padding: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: knobX, width: 22, height: 22, borderRadius: '50%',
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#2b2926' }}>
              Activar mi perfil de desarrollo
            </span>
          </div>

          {/* Mensajes según estado */}
          {sw === true && (
            <div style={{ background: '#f3fae0', border: '1px solid #cbf135', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, color: '#3a4a14', marginBottom: 16 }}>
              ✅ Listo. Activaste tu perfil de desarrollo. Ahora la plataforma puede acompañarte de verdad y darte un coaching ajustado a ti, no genérico. Esto es tuyo: no se comparte con tu supervisor ni aparece en informes de gestión.
            </div>
          )}
          {sw === false && (
            <div style={{ background: '#fef3cd', border: '1px solid #f5c518', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, color: '#7a5014', marginBottom: 16 }}>
              ⚠️ Quedas en la versión básica. Sin tu autorización, la orientación que recibas será general, no ajustada a ti. Puedes activarlo cuando quieras desde tu perfil.
            </div>
          )}

          <button
            onClick={() => { if (sw !== null) onDecidir(sw) }}
            disabled={sw === null}
            style={{ width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              background: sw === null ? '#e8e6e3' : '#0b0a09', color: sw === null ? '#8a8885' : '#cbf135',
              fontSize: 15, fontWeight: 800, cursor: sw === null ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s' }}
          >
            Continuar →
          </button>
          {sw === null && (
            <p style={{ fontSize: 11, color: '#b8b4af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
              Elige una opción para continuar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
