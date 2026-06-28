// Vertice compartido del cuestionario TPS.
// El host monta cada pantalla en su propia ruta (p.ej. /cuestionario, /cuestionario/a ...) y
// envuelve todo con <HostProvider adapter={...}>. La landing (CuestionarioLanding) es la raíz.
export { HostProvider, useHost } from './host'
export type { HostAdapter, HostSession } from './host'

export { default as CuestionarioLanding } from './page'
export { default as ModuloA } from './a/page'
export { default as ModuloB } from './b/page'
export { default as ModuloC } from './c/page'
export { default as ModuloD } from './d/page'
export { default as CuestionarioListo } from './listo/page'
