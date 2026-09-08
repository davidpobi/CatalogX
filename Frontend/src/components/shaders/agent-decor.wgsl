struct Params {
  time: f32,
  speed: f32,
  intensity: f32,
  elementCount: f32,
  phase: f32,
  retry: f32,
  width: f32,
  height: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let travel = fract(uv.x - params.time * 0.055 * params.speed);
  let sweep = 1.0 - smoothstep(0.0, 0.22, abs(travel - 0.5));
  let verticalFade = 1.0 - smoothstep(0.0, 0.5, abs(uv.y - 0.5));
  let strength = sweep * verticalFade * 0.055 * params.intensity;
  return vec4f(vec3f(0.86, 0.81, 0.71) * strength, strength);
}
