'use client'
//
// ADAPTADOR del host. El wizard NO conoce axios/localStorage/router del host: consume
// todo via <HostProvider adapter={...}>. Así sailor-front y proxis-next montan el mismo wizard
// inyectando su propia implementación. El wizard no debe importar @/core/*, @/context/*,
// next/navigation ni next/link.
//
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface HostSession {
  asesor: string
  rol: string
  token?: string
  titulo_cargo?: string | null
}

export interface HostAdapter {
  /** GET a un endpoint del backend (devuelve { data } como axios). */
  apiGet: (path: string) => Promise<{ data: any }>
  /** POST a un endpoint del backend (devuelve { data } como axios). */
  apiPost: (path: string, body: any) => Promise<{ data: any }>
  /** Identidad del asesor (null si aún no hay sesión). */
  getSession: () => HostSession | null
  /** True mientras el host resuelve la sesión (gating, igual que authLoading). */
  loading: boolean
  /** Navegación entre pantallas del wizard (el host mapea el path a su estructura de rutas). */
  navigate: (path: string) => void
  /** El wizard terminó (Módulo D → listo). */
  onDone: () => void
  /** El asesor sale del wizard (volver al feed / pantalla principal del host). */
  onExit: () => void
  /** El asesor no tiene sesión (el host debe llevarlo a login). */
  onAuthNeeded: () => void
}

const HostContext = createContext<HostAdapter | null>(null)

export function HostProvider({ adapter, children }: { adapter: HostAdapter; children: ReactNode }) {
  return <HostContext.Provider value={adapter}>{children}</HostContext.Provider>
}

export function useHost(): HostAdapter {
  const ctx = useContext(HostContext)
  if (!ctx) throw new Error('useHost debe usarse dentro de <HostProvider adapter={...}>')
  return ctx
}
