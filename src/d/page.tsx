'use client'
import { useEffect, useState, useRef } from 'react'
import { useHost } from '../host'

type Opcion  = { perfil: string; label: string }
type ItemD   = { id: string; texto: string; dimension_target: string; opciones: Opcion[] }

export default function ModuloD() {
  const { getSession, loading: authLoading, navigate, apiGet, apiPost, onExit, onAuthNeeded, onDone } = useHost()
  const session = getSession()
  const api = { get: apiGet, post: apiPost }
  const router = { push: navigate, replace: navigate }
  const guardarProgresoTps = (_a: string, progress: number) => apiPost('/api/cuestionario/progreso', { progress })
  const [items,      setItems]      = useState<ItemD[]>([])
  const [step,       setStep]       = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [enviando,   setEnviando]   = useState(false)
  const [listo,      setListo]      = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!session) { onAuthNeeded(); return }

    const preguntas = JSON.parse(localStorage.getItem('tps_preguntas') || 'null')
    if (!preguntas?.D?.length) { router.replace('/cuestionario'); return }

    const sesion   = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    const prevResp = sesion.respuestas_d || {}

    setItems(preguntas.D.map((p: any) => ({
      id:               p.id,
      texto:            p.texto,
      dimension_target: p.dimension_target,
      opciones:         p.opciones ?? [],
    })))
    setRespuestas(prevResp)

    const respondidas = Object.keys(prevResp).length
    setStep(Math.min(respondidas, preguntas.D.length - 1))
  }, [authLoading, session])

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

  async function seleccionar(perfil: string) {
    if (listo || enviando) return
    const item = items[step]
    if (!item) return

    const nuevas = { ...respuestas, [item.id]: perfil }
    setRespuestas(nuevas)

    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    sesion.respuestas_d = nuevas
    localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
    programarAutosave(sesion.cuestionario_id, nuevas)

    if (step < items.length - 1) {
      setTimeout(() => setStep(s => s + 1), 300)
    } else {
      // Último ítem — enviar todo
      setListo(true)
      await enviarEvaluacion(sesion, nuevas)
    }
  }

  async function enviarEvaluacion(sesion: any, respuestasD: Record<string, string>) {
    setEnviando(true)
    try {
      const preguntas  = JSON.parse(localStorage.getItem('tps_preguntas') || '{}')
      const cuestionario_id = sesion.cuestionario_id

      // Construir array de respuestas completo (A + B + C + D)
      const todas: { pregunta_id: string; respuesta: string }[] = []

      const pushMap = (map: Record<string, any>) => {
        for (const [pid, val] of Object.entries(map)) {
          todas.push({ pregunta_id: pid, respuesta: String(val) })
        }
      }

      pushMap(sesion.respuestas_a || {})
      pushMap(sesion.respuestas_b || {})
      pushMap(sesion.respuestas_c || {})
      pushMap(respuestasD)

      // Consentimiento §5.5 (capa 3): el switch de la pantalla §3.1 (Módulo C) lo dejó en
      // sesion.consentimiento_sensible. El gate de tps-evaluar lee body.consentimiento === true.
      // Booleano exacto: true solo si activó (verde); rojo/neutro/ausente → false (fail-closed).
      const consentimiento = sesion?.consentimiento_sensible === true

      // asesor NO se envía: el backend lo deriva del JWT Sailor (endurecimiento §5.3).
      const res = await api.post('/api/cuestionario/tps-evaluar', {
        cuestionario_id,
        respuestas: todas,
        consentimiento,
      })

      localStorage.setItem('tps_perfil_resultado', JSON.stringify(res.data.resultado))
      sesion.completado = true
      localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))

      onDone()
    } catch (e) {
      console.error('[D] Error al enviar evaluación:', e)
      setListo(false)
      setEnviando(false)
    }
  }

  function salir() {
    if (session) guardarProgresoTps(session.asesor, 90)
    onExit()
  }

  if (!items.length) return <div style={{ minHeight: '100vh', background: '#f5f3ef' }} />

  const item     = items[step]
  const total    = items.length
  const progreso = (step / total) * 100

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0b0a09', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evaluación TPS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>Módulo D — Escenarios</div>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono), monospace' }}>
            {step + 1}/{total}
          </div>
        </div>
        {!enviando && !listo && (
          <button onClick={salir} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, padding: '0 0 8px', textDecoration: 'underline',
          }}>
            Guardar y retomar más tarde
          </button>
        )}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#cbf135', borderRadius: 2, width: `${progreso}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a8885', marginBottom: 16, textAlign: 'center' }}>
          ¿Qué harías en esta situación?
        </div>

        {/* Escenario */}
        <div style={{ background: '#0b0a09', borderRadius: 14, padding: '20px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
            {item.texto}
          </p>
        </div>

        {/* Opciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(item.opciones || []).map((op, idx) => {
            const letras = ['A', 'B', 'C', 'D']
            const sel    = respuestas[item.id] === op.perfil
            return (
              <button key={idx} onClick={() => seleccionar(op.perfil)}
                disabled={enviando || listo}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                  background: sel ? '#cbf135' : '#fff',
                  border: `1.5px solid ${sel ? '#a8cc1a' : '#e8e6e3'}`,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}>
                <span style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                  background: sel ? '#0b0a09' : '#f5f3ef',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: sel ? '#cbf135' : '#8a8885',
                }}>
                  {letras[idx]}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: sel ? '#0b0a09' : '#4a4844' }}>
                  {op.label}
                </span>
              </button>
            )
          })}
        </div>

        {enviando && (
          <div style={{ textAlign: 'center', marginTop: 32, color: '#8a8885', fontSize: 13 }}>
            Calculando tu perfil...
          </div>
        )}
      </div>
    </div>
  )
}
