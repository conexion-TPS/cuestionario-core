'use client'
import { useEffect, useState, useRef } from 'react'
import { useHost } from '../host'

type Item = { id: string; polo_izq: string; polo_der: string }

export default function ModuloB() {
  const { getSession, loading: authLoading, navigate, apiGet, apiPost, onExit, onAuthNeeded } = useHost()
  const session = getSession()
  const api = { get: apiGet, post: apiPost }
  const router = { push: navigate, replace: navigate }
  const guardarProgresoTps = (_a: string, progress: number) => apiPost('/api/cuestionario/progreso', { progress })
  const [items,      setItems]      = useState<Item[]>([])
  const [step,       setStep]       = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, number>>({})
  const [listo,      setListo]      = useState(false)
  const [guardando,  setGuardando]  = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!session) { onAuthNeeded(); return }

    const preguntas = JSON.parse(localStorage.getItem('tps_preguntas') || 'null')
    if (!preguntas?.B?.length) { router.replace('/cuestionario'); return }

    const sesion    = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    const prevResp  = sesion.respuestas_b || {}

    const localItems = preguntas.B.map((p: any) => ({
      id: p.id, polo_izq: p.opciones?.polo_izq ?? '', polo_der: p.opciones?.polo_der ?? '',
    }))
    setItems(localItems)
    setRespuestas(prevResp)

    const primerSinRespuesta = localItems.findIndex((it: { id: string }) => !(it.id in prevResp))
    if (primerSinRespuesta === -1) {
      setListo(true)
      router.replace('/cuestionario/c')
    } else if (primerSinRespuesta > 0) {
      setStep(primerSinRespuesta)
    }
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

  function seleccionar(valor: number) {
    if (listo) return
    const item = items[step]
    if (!item) return

    const nuevas = { ...respuestas, [item.id]: valor }
    setRespuestas(nuevas)

    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    sesion.respuestas_b = nuevas
    localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
    programarAutosave(sesion.cuestionario_id, nuevas)

    if (step < items.length - 1) {
      setTimeout(() => setStep(s => s + 1), 250)
    } else {
      setListo(true)
      if (session) guardarProgresoTps(session.asesor, 50)
      setTimeout(() => router.push('/cuestionario/c'), 400)
    }
  }

  function salir() {
    if (session) guardarProgresoTps(session.asesor, 35)
    onExit()
  }

  function guardarYSalir() {
    if (guardando || listo) return
    setGuardando(true)
    let yaSalio = false
    let timer: ReturnType<typeof setTimeout>
    function salirOnce() { if (!yaSalio) { yaSalio = true; clearTimeout(timer); onExit() } }
    timer = setTimeout(salirOnce, 2000)
    ;(async () => {
      try {
        const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
        if (sesion.cuestionario_id && Object.keys(respuestas).length) {
          const filas = Object.entries(respuestas).map(([pregunta_id, val]) => ({ pregunta_id, respuesta: String(val) }))
          await api.post('/api/cuestionario/progreso-modulos', { cuestionario_id: sesion.cuestionario_id, respuestas: filas })
        }
      } catch { salirOnce() }
    })()
  }

  if (!items.length) return <LayoutVacio />

  const item     = items[step]
  const total    = items.length
  const progreso = (step / total) * 100

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0b0a09', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evaluación TPS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>Módulo B — Estilo Relacional</div>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono), monospace' }}>{step + 1}/{total}</div>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#cbf135', borderRadius: 2, width: `${progreso}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 20px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a8885', textAlign: 'center', marginBottom: 20 }}>
            ¿Cuál de los dos extremos te describe mejor?
          </div>

          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 20px', border: '1px solid #e8e6e3' }}>
            <div style={{ fontSize: 14, color: '#4a4844', textAlign: 'center', marginBottom: 24, lineHeight: 1.5, minHeight: 42 }}>
              {item.polo_izq}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              {[1, 2, 3, 4].map(v => {
                const selected = respuestas[item.id] === v
                return (
                  <button key={v} onClick={() => seleccionar(v)} style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: selected ? '#cbf135' : '#f5f3ef',
                    border: `2px solid ${selected ? '#a8cc1a' : '#e8e6e3'}`,
                    fontSize: 17, fontWeight: 800, cursor: 'pointer',
                    color: selected ? '#0b0a09' : '#8a8885',
                    transition: 'all 0.15s', fontFamily: 'inherit',
                  }}>{v}</button>
                )
              })}
            </div>

            <div style={{ fontSize: 14, color: '#4a4844', textAlign: 'center', lineHeight: 1.5, minHeight: 42 }}>
              {item.polo_der}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '0 4px' }}>
            <span style={{ fontSize: 13, color: '#000' }}>1 = muy parecido al texto de arriba</span>
            <span style={{ fontSize: 13, color: '#000' }}>4 = muy parecido al texto de abajo</span>
          </div>
        </div>
        {!listo && (
          <button onClick={guardarYSalir} disabled={guardando} style={{
            marginTop: 12, width: '100%', padding: '13px 0',
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
        )}
      </div>
    </div>
  )
}

function LayoutVacio() {
  return <div style={{ minHeight: '100vh', background: '#f5f3ef' }} />
}
