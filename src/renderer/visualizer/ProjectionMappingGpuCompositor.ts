import type { ProjectionMappingOutput } from '../../visualizer/threejs/layers/LayerConfig'
import {
  homographyFromCorners,
  projectNormalizedPoint,
} from '../../shared/projectionHomography'

const VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv);
}
`

const VERT_SRC_WEBGL1 = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG_SRC_WEBGL1 = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}
`

/** Subdivision so the mesh follows the projective keystone, not a bilinear pin. */
const GRID_DIV = 16

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Projection mapping shader compile failed', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function linkProgram(
  gl: WebGLRenderingContext,
  vert: WebGLShader,
  frag: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Projection mapping program link failed', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

/**
 * GPU compositor for visualizer projection mapping.
 * Samples the visualizer source canvas once as a texture and draws each
 * output as a projective keystone mesh (crop via UVs).
 */
export class ProjectionMappingGpuCompositor {
  private readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private isWebGL2 = false
  private tex: WebGLTexture | null = null
  private vbo: WebGLBuffer | null = null
  private ibo: WebGLBuffer | null = null
  private vao: WebGLVertexArrayObject | null = null
  private uTex: WebGLUniformLocation | null = null
  private aPos = 0
  private aUv = 1
  private indexCount = 0
  private width = 0
  private height = 0
  private failed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.init()
  }

  get ok(): boolean {
    return this.gl !== null && this.program !== null && !this.failed
  }

  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.width === w && this.height === h) return
    this.width = w
    this.height = h
    this.canvas.width = w
    this.canvas.height = h
    const gl = this.gl
    if (gl) gl.viewport(0, 0, w, h)
  }

  draw(
    source: HTMLCanvasElement,
    outputs: readonly ProjectionMappingOutput[]
  ): boolean {
    const gl = this.gl
    const program = this.program
    if (!gl || !program || this.failed || !this.ok) return false
    if (source.width <= 0 || source.height <= 0) return false
    if (this.width <= 0 || this.height <= 0) return false

    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    // Match Canvas2D top-left sourceRect coordinates.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      )
    } catch (err) {
      console.warn('Projection mapping texture upload failed', err)
      this.failed = true
      return false
    }

    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    if (this.uTex) gl.uniform1i(this.uTex, 0)

    for (const output of outputs) {
      if (!output.enabled) continue
      this.drawOutput(gl, output)
    }

    if (this.isWebGL2 && this.vao) {
      ;(gl as WebGL2RenderingContext).bindVertexArray(null)
    }
    return true
  }

  dispose() {
    const gl = this.gl
    if (!gl) return
    if (this.tex) gl.deleteTexture(this.tex)
    if (this.vbo) gl.deleteBuffer(this.vbo)
    if (this.ibo) gl.deleteBuffer(this.ibo)
    if (this.program) gl.deleteProgram(this.program)
    if (this.isWebGL2 && this.vao) {
      ;(gl as WebGL2RenderingContext).deleteVertexArray(this.vao)
    }
    this.gl = null
    this.program = null
    this.tex = null
    this.vbo = null
    this.ibo = null
    this.vao = null
  }

  private init() {
    const gl2 = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    const gl =
      gl2 ??
      (this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) as WebGLRenderingContext | null)

    if (!gl) {
      this.failed = true
      return
    }
    this.gl = gl
    this.isWebGL2 = gl2 !== null

    const vert = compileShader(
      gl,
      gl.VERTEX_SHADER,
      this.isWebGL2 ? VERT_SRC : VERT_SRC_WEBGL1
    )
    const frag = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      this.isWebGL2 ? FRAG_SRC : FRAG_SRC_WEBGL1
    )
    if (!vert || !frag) {
      this.failed = true
      return
    }
    const program = linkProgram(gl, vert, frag)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!program) {
      this.failed = true
      return
    }
    this.program = program
    this.uTex = gl.getUniformLocation(program, 'u_tex')
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aUv = gl.getAttribLocation(program, 'a_uv')

    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.vbo = gl.createBuffer()
    this.ibo = gl.createBuffer()
    if (this.isWebGL2) {
      this.vao = (gl as WebGL2RenderingContext).createVertexArray()
    }

    // Build static index buffer for GRID_DIV x GRID_DIV quads.
    const indices: number[] = []
    for (let row = 0; row < GRID_DIV; row++) {
      for (let col = 0; col < GRID_DIV; col++) {
        const i0 = row * (GRID_DIV + 1) + col
        const i1 = i0 + 1
        const i2 = i0 + (GRID_DIV + 1)
        const i3 = i2 + 1
        indices.push(i0, i2, i1, i1, i2, i3)
      }
    }
    this.indexCount = indices.length
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indices),
      gl.STATIC_DRAW
    )

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
  }

  private drawOutput(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    output: ProjectionMappingOutput
  ) {
    if (!this.vbo || !this.ibo || !this.program) return

    // Interleaved pos(x,y) + uv(u,v) in clip space / texture space.
    const verts = new Float32Array((GRID_DIV + 1) * (GRID_DIV + 1) * 4)
    let o = 0
    const sr = output.sourceRect
    const warp = homographyFromCorners(output.corners)
    for (let row = 0; row <= GRID_DIV; row++) {
      const v = row / GRID_DIV
      for (let col = 0; col <= GRID_DIV; col++) {
        const u = col / GRID_DIV
        const p = projectNormalizedPoint(warp, output.corners, u, v)
        // NDC: x,y in [0,1] → [-1,1], Y flipped for canvas top-left.
        verts[o++] = p.x * 2 - 1
        verts[o++] = 1 - p.y * 2
        verts[o++] = sr.x + u * sr.width
        verts[o++] = sr.y + v * sr.height
      }
    }

    if (this.isWebGL2 && this.vao) {
      ;(gl as WebGL2RenderingContext).bindVertexArray(this.vao)
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)

    const stride = 16
    if (this.aPos >= 0) {
      gl.enableVertexAttribArray(this.aPos)
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0)
    }
    if (this.aUv >= 0) {
      gl.enableVertexAttribArray(this.aUv)
      gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, stride, 8)
    }

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
  }
}
