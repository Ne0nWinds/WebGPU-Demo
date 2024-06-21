
struct VSOut {
    @builtin(position) nds_position: vec4<f32>,
    @location(0) color: vec3<f32>
};

struct UBO {
    color: vec4<f32>
};

@group(0) @binding(0)
var<uniform> uniforms: UBO;

@vertex
fn vertex(
    @location(0) in_pos: vec3<f32>,
    @location(1) in_color: vec3<f32>
) -> VSOut {
    var vs_out: VSOut;
    vs_out.nds_position = vec4<f32>(in_pos, 1.0);

    var t: f32 = sin(uniforms.color.x / 512.0) * 0.5 + 0.5;
    vs_out.color = in_color * t;
    return vs_out;
}

@fragment
fn fragment(
    @location(0) in_color: vec3<f32>
) -> @location(0) vec4<f32> {
    return vec4<f32>(in_color, 1.0);
}