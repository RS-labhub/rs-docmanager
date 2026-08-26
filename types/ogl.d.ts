// ogl ships no type definitions; minimal ambient declarations for what we use.
declare module "ogl" {
  export class Renderer {
    constructor(options?: { dpr?: number; alpha?: boolean; antialias?: boolean; powerPreference?: string })
    gl: WebGL2RenderingContext & { canvas: HTMLCanvasElement }
    setSize(width: number, height: number): void
    render(options: { scene: unknown }): void
  }
  export class Program {
    constructor(gl: unknown, options: { vertex: string; fragment: string; uniforms?: Record<string, { value: unknown }> })
    uniforms: Record<string, { value: any }>
  }
  export class Mesh {
    constructor(gl: unknown, options: { geometry: unknown; program: Program })
  }
  export class Triangle {
    constructor(gl: unknown)
  }
  export class Texture {
    constructor(gl: unknown, options?: Record<string, unknown>)
    image: unknown
    width: number
    height: number
    minFilter: number
    magFilter: number
    wrapS: number
    wrapT: number
    needsUpdate: boolean
    texture: WebGLTexture
  }
}
