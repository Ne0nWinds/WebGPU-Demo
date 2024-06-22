
struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>
};

struct UBO {
    modelViewProjectionMatrix: mat4x4f,
    color: vec4<f32>
};

@group(0) @binding(0)
var<uniform> uniforms: UBO;

fn random(a: f32) -> f32 {
    return fract(cos(a * 4510.342916) * 192.182923);
}

@vertex
fn vertex(
    @builtin(vertex_index) vi: u32,
    @location(0) in_pos: vec3<f32>,
) -> VSOut {
    var vs_out: VSOut;

    var pos: vec3<f32> = in_pos;

    vs_out.position = uniforms.modelViewProjectionMatrix * vec4<f32>(pos, 1.0);
    vs_out.color = vec3<f32>(random(f32(vi)));
    return vs_out;
}

@fragment
fn fragment(
    @location(0) in_color: vec3<f32>
) -> @location(0) vec4<f32> {
    return vec4<f32>(in_color, 1.0);
}