'use client'
import { useEffect, useState } from 'react'
import { useHost } from './host'

type TpsPreguntas = {
  cuestionario_id: string
  A: any[]; B: any[]; C: any[]; D: any[]
}

export default function CuestionarioLanding() {
  const { getSession, loading: authLoading, navigate, apiGet, apiPost, onExit, onAuthNeeded } = useHost()
  const session = getSession()
  const api = { get: apiGet, post: apiPost }
  const router = { push: navigate, replace: navigate }
  const [estado, setEstado] = useState<'cargando' | 'completado' | 'en_progreso' | 'nuevo'>('cargando')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!session) { onAuthNeeded(); return }
    verificar()
  }, [authLoading, session])

  // Precarga server-side del avance: GET progreso-modulos, agrupar por modulo en maps
  // pregunta_id→respuesta (A/B/C numérico, D string) y fusionar con 'tps_evaluacion' local.
  // Server gana en conflicto. Best-effort: si falla, se sigue solo con localStorage.
  async function precargarProgresoServer() {
    try {
      const { data } = await api.get('/api/cuestionario/progreso-modulos')
      const rows: any[] = data?.respuestas ?? []
      if (!rows.length) return
      const num: Record<string, Record<string, number>> = { A: {}, B: {}, C: {} }
      const d: Record<string, string> = {}
      for (const r of rows) {
        if (!r.pregunta_id) continue
        const m = String(r.modulo || '').toUpperCase()
        if (m === 'D') d[r.pregunta_id] = String(r.respuesta)
        else if (m in num) num[m][r.pregunta_id] = Number(r.respuesta)
      }
      const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
      sesion.respuestas_a = { ...(sesion.respuestas_a || {}), ...num.A }
      sesion.respuestas_b = { ...(sesion.respuestas_b || {}), ...num.B }
      sesion.respuestas_c = { ...(sesion.respuestas_c || {}), ...num.C }
      sesion.respuestas_d = { ...(sesion.respuestas_d || {}), ...d }
      localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
    } catch { /* best-effort: seguir con localStorage */ }
  }

  // Fetchea el instrumento, escribe tps_preguntas y siembra cuestionario_id/asesor en
  // tps_evaluacion SIN pisar respuestas existentes. Devuelve cuestionario_id o undefined.
  async function prepararInstrumento(): Promise<string | undefined> {
    try {
      const { data } = await api.get('/api/cuestionario/instrumento')
      const cuestionarioId: string | undefined = data?.cuestionario_id
      const preguntas: any[] = data?.preguntas ?? []
      if (!cuestionarioId || !preguntas.length) return undefined
      const estructura: TpsPreguntas = {
        cuestionario_id: cuestionarioId,
        A: preguntas.filter(p => p.dimension_target === 'tps_a'),
        B: preguntas.filter(p => p.dimension_target === 'tps_b'),
        C: preguntas.filter(p => p.dimension_target?.startsWith('tps_c_')),
        D: preguntas.filter(p => p.dimension_target === 'tps_d' || p.dimension_target === 'tps_d8'),
      }
      localStorage.setItem('tps_preguntas', JSON.stringify(estructura))
      const seed = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
      seed.asesor = session!.asesor
      seed.cuestionario_id = cuestionarioId
      if (!seed.respuestas_a) seed.respuestas_a = {}
      if (!seed.respuestas_b) seed.respuestas_b = {}
      if (!seed.respuestas_c) seed.respuestas_c = {}
      if (!seed.respuestas_d) seed.respuestas_d = {}
      if (seed.completado === undefined) seed.completado = false
      localStorage.setItem('tps_evaluacion', JSON.stringify(seed))
      return cuestionarioId
    } catch { return undefined }
  }

  async function verificar() {
    // 1. Estado server-side (JWT Sailor): SOLO booleano. 'pendiente'/''/null no son completado;
    //    el backend evalúa perfil_base ∈ {E,S,R,A,AMB}. No expone el perfil ni el dato sensible.
    let completado = false
    try {
      const { data } = await api.get('/api/cuestionario/estado')
      completado = data?.completado === true
    } catch { /* sin estado → tratar como no completado y seguir con localStorage */ }

    if (completado) {
      // Cargar el resultado saneado del PROPIO asesor para la pantalla "listo"
      try {
        const { data } = await api.get('/api/cuestionario/resultado')
        if (data?.resultado) localStorage.setItem('tps_perfil_resultado', JSON.stringify(data.resultado))
      } catch { /* el resultado se puede recargar luego */ }
      const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
      sesion.completado = true
      localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
      setEstado('completado')
      return
    }

    // Instrumento PRIMERO: cuestionario_id + preguntas en el cliente (escribe tps_preguntas y
    // siembra cuestionario_id/asesor en tps_evaluacion SIN pisar respuestas existentes).
    await prepararInstrumento()

    // Precarga server-side: fusionar avance del server en la sesión local (server gana).
    await precargarProgresoServer()

    // 2. No completado → si localStorage quedó con un flag "completado" stale
    //    (p.ej. perfil reseteado en backend), limpiarlo para no bloquear la evaluación.
    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || 'null')
    if (sesion?.completado) {
      sesion.completado = false
      localStorage.setItem('tps_evaluacion', JSON.stringify(sesion))
      localStorage.removeItem('tps_perfil_resultado')
    }
    // EN-CURSO solo si hay cuestionario_id Y respuestas (fusionadas del server o locales).
    // Sin respuestas → NUEVO (asesor realmente nuevo o sin avance).
    const tieneRespuestas =
      Object.keys(sesion?.respuestas_a || {}).length ||
      Object.keys(sesion?.respuestas_b || {}).length ||
      Object.keys(sesion?.respuestas_c || {}).length ||
      Object.keys(sesion?.respuestas_d || {}).length
    if (sesion?.cuestionario_id && tieneRespuestas) {
      setEstado('en_progreso')
      return
    }

    setEstado('nuevo')
  }

  async function comenzar() {
    setCargando(true)
    setError('')
    try {
      // Respetar la sesión ya sembrada por verificar() (cuestionario_id presente): NO pisar
      // tps_evaluacion. Si verificar() no pudo fetchar el instrumento, hacerlo acá (fallback).
      const prev = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
      const cuestionarioId = prev.cuestionario_id ?? await prepararInstrumento()
      if (!cuestionarioId) throw new Error('Instrumento no encontrado')

      // Registrar inicio (NO crítico): solo alimenta la barra de avance; las respuestas
      // viven en localStorage. Para un asesor sin perfil aún, el backend puede fallar al
      // crear la fila tps_perfiles (columnas de perfil NOT NULL) → eso NO debe impedir
      // empezar el cuestionario. Best-effort: si falla, seguimos igual.
      try {
        await api.post('/api/cuestionario/progreso', { progress: 0 })
      } catch (e) {
        console.warn('[cuestionario] no se pudo registrar el progreso inicial (no crítico):', e)
      }

      router.push('/cuestionario/a')
    } catch (e) {
      console.error('[cuestionario] no se pudo iniciar la evaluación:', e)
      setError(describirError(e))
      setCargando(false)
    }
  }

  function continuar() {
    const sesion = JSON.parse(localStorage.getItem('tps_evaluacion') || '{}')
    const preguntas = JSON.parse(localStorage.getItem('tps_preguntas') || '{}')
    const nA = Object.keys(sesion.respuestas_a || {}).length
    const nB = Object.keys(sesion.respuestas_b || {}).length
    const nC = Object.keys(sesion.respuestas_c || {}).length
    if (nA < (preguntas.A?.length ?? 12)) { router.push('/cuestionario/a'); return }
    if (nB < (preguntas.B?.length ?? 12)) { router.push('/cuestionario/b'); return }
    if (nC < (preguntas.C?.length ?? 25)) { router.push('/cuestionario/c'); return }
    router.push('/cuestionario/d')
  }

  if (authLoading || estado === 'cargando') return <Spinner />

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0b0a09', padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proxis Coach</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>Evaluación TPS</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <div style={{ maxWidth: 420, width: '100%' }}>

          {estado === 'completado' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ya completaste la evaluación</div>
              <div style={{ fontSize: 14, color: '#8a8885', lineHeight: 1.6, marginBottom: 32 }}>
                Tu perfil conductual TPS ya fue calculado y está disponible.
              </div>
              <button onClick={() => router.push('/cuestionario/listo')}
                style={{ width: '100%', padding: '15px 0', background: '#cbf135', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', color: '#0b0a09' }}>
                Ver mi perfil →
              </button>
              <button onClick={() => onExit()} style={linkStyle}>
                ← Volver al feed
              </button>
            </div>
          )}

          {estado === 'en_progreso' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Evaluación en progreso</div>
              <div style={{ fontSize: 14, color: '#8a8885', lineHeight: 1.6, marginBottom: 32 }}>
                Dejaste la evaluación a la mitad. Puedes retomar desde donde quedaste.
              </div>
              <button onClick={continuar}
                style={{ width: '100%', padding: '15px 0', background: '#cbf135', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', color: '#0b0a09', marginBottom: 12 }}>
                Continuar →
              </button>
              <button onClick={() => onExit()} style={linkStyle}>← Volver al feed</button>
            </div>
          )}

          {estado === 'nuevo' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🧩</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Evaluación Conductual TPS</div>
                <div style={{ fontSize: 14, color: '#8a8885', lineHeight: 1.6 }}>
                  Esta evaluación te ayuda a entender tu estilo natural de venta y áreas de desarrollo. No hay respuestas correctas o incorrectas.
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 14, padding: '20px 20px', border: '1px solid #e8e6e3', marginBottom: 24 }}>
                {[
                  ['📐', 'Módulo A', '12 ítems · Estilo de Iniciativa'],
                  ['🌡️', 'Módulo B', '12 ítems · Estilo Relacional'],
                  ['📊', 'Módulo C', '25 ítems · Rasgos Comerciales'],
                  ['🎯', 'Módulo D', '8 escenarios · Juicio Situacional'],
                ].map(([icon, mod, desc]) => (
                  <div key={mod} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f3ef' }}>
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{mod}</div>
                      <div style={{ fontSize: 11, color: '#8a8885' }}>{desc}</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: '#8a8885', marginTop: 14, textAlign: 'center' }}>
                  Tiempo estimado: 12–18 minutos
                </div>
              </div>

              {error && (
                <div style={{ background: '#fbe9e9', border: '1px solid #f5c6c6', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b03a3a', marginBottom: 12, lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
              <button onClick={comenzar} disabled={cargando}
                style={{ width: '100%', padding: '15px 0', background: '#cbf135', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: cargando ? 'not-allowed' : 'pointer', color: '#0b0a09', opacity: cargando ? 0.7 : 1 }}>
                {cargando ? 'Preparando...' : error ? 'Reintentar →' : 'Comenzar →'}
              </button>
              <button onClick={() => onExit()} style={linkStyle}>← Volver al feed</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 14, padding: '12px 0',
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 13, color: '#8a8885', textAlign: 'center', fontFamily: 'inherit',
}

// Traduce el fallo real de comenzar() a un mensaje claro para el asesor (antes se tragaba en silencio).
function describirError(e: any): string {
  const status: number | undefined = e?.response?.status
  if (status === 401) return 'Tu sesión no está autorizada para abrir la evaluación. Cierra sesión y vuelve a ingresar.'
  if (status === 404 || e?.message === 'Instrumento no encontrado') return 'No encontramos el cuestionario en el servidor. Avísale al equipo Proxis.'
  if (e?.message === 'Sin preguntas') return 'El cuestionario no tiene preguntas configuradas. Avísale al equipo Proxis.'
  if (e?.code === 'ERR_NETWORK' || !e?.response) return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.'
  return `No pudimos iniciar la evaluación (error ${status}). Inténtalo nuevamente.`
}

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e8e6e3', borderTopColor: '#0b0a09', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
