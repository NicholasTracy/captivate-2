import { tryGetKoffi } from './koffiNative'

type KoffiModule = NonNullable<ReturnType<typeof tryGetKoffi>>

export interface NdiSdkStructs {
  sourceType: unknown
  videoFrameType: unknown
}

let structs: NdiSdkStructs | null = null

/** Register the NDI structs once. Later callers share the same definitions. */
export function ensureNdiSdkStructs(koffi: KoffiModule): NdiSdkStructs {
  if (structs) {
    return structs
  }
  const sourceType = koffi.struct('NDIlib_source_t', {
    p_ndi_name: 'const char *',
    p_url_address: 'const char *',
  })
  koffi.struct('NDIlib_find_create_t', {
    show_local_sources: 'bool',
    p_groups: 'const char *',
    p_extra_ips: 'const char *',
  })
  koffi.struct('NDIlib_send_create_t', {
    p_ndi_name: 'const char *',
    p_groups: 'const char *',
    clock_video: 'bool',
    clock_audio: 'bool',
  })
  const videoFrameType = koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int',
    yres: 'int',
    FourCC: 'uint32_t',
    frame_rate_N: 'int',
    frame_rate_D: 'int',
    picture_aspect_ratio: 'float',
    frame_format_type: 'int',
    timecode: 'int64_t',
    p_data: 'void *',
    line_stride_in_bytes: 'int',
    p_metadata: 'const char *',
    timestamp: 'int64_t',
  })
  koffi.struct('NDIlib_recv_create_v3_t', {
    source_to_connect_to: sourceType,
    color_format: 'int',
    bandwidth: 'int',
    allow_video_fields: 'bool',
    p_ndi_recv_name: 'const char *',
  })
  structs = { sourceType, videoFrameType }
  return structs
}
