
struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>
};

struct UBO {
    modelViewProjectionMatrix: mat4x4f,
    time: vec4<f32>
};

@group(0) @binding(0)
var<uniform> uniforms: UBO;

fn random(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(21891.2831011987, 18598.84086105)) / 801.639173907) * 5192.92834519);
}

fn noise(p: vec2<f32>) -> f32 {
    var f: vec2<f32> = fract(p);
    var i: vec2<f32> = floor(p);

    var p0: f32 = random(i + vec2<f32>(0, 0));
    var p1: f32 = random(i + vec2<f32>(1, 0));
    var p2: f32 = random(i + vec2<f32>(0, 1));
    var p3: f32 = random(i + vec2<f32>(1, 1));

    var x0: f32 = mix(p0, p1, f.x);
    var x1: f32 = mix(p2, p3, f.x);

    var result: f32 = mix(x0, x1, f.y);
    return result;
}

fn fbm(p: vec2<f32>, octaves: u32, persistance: f32, lacunarity: f32) -> f32 {
    var amplitude: f32 = 0.5;
    var frequency: f32 = 1.0;
    var total: f32 = 0.0;
    var normalization: f32 = 0.0;

    for (var i: u32; i < octaves; i += 1) {
        var noiseValue = noise(p * frequency);
        noiseValue = 1.0 - abs(noiseValue);

        total += noiseValue * amplitude;
        normalization += amplitude;
        amplitude *= persistance;
        frequency *= lacunarity;
    }

    return total / normalization;
}



@vertex
fn vertex(
    @location(0) in_pos: vec3<f32>,
) -> VSOut {
    var vs_out: VSOut;

    var pos = in_pos;

    var seed = vec2<f32>(pos.x, pos.z);
    // seed.x += uniforms.time.x / 768;
    // seed.y += uniforms.time.x / 510.102;
    var time = uniforms.time.x;

    // noise2 = 0.0;

    var height = fbm(seed + 8.1, 10, 0.45, 2.2) * 1.78;
    pos.y = height;

    vs_out.position = uniforms.modelViewProjectionMatrix * vec4<f32>(pos, 1.0);

    var white = vec3<f32>(0.898);
    var green = vec3<f32>(0.4176, 0.6765, 0.351);
    var darkgreen = vec3<f32>(50.0 / 255.0, 107.0 / 255.0, 50.0 / 255.0);
    var grey = vec3<f32>(50.0 / 255.0);
    var black = vec3<f32>(0.0);

    var outputColor = mix(white, green, smoothstep(1.65, 1.18, height));
    outputColor = mix(outputColor, darkgreen, smoothstep(1.35, 0.9, height));

    var rocknoise = mix(0.0, fbm(seed + 41.92, 10, 0.45, 2.1), 1.78 - height);
    outputColor = mix(outputColor, grey, rocknoise);

    outputColor = mix(outputColor, black, smoothstep(0.0, 3.75, max(0.0, length(vs_out.position) - 4.0)));

    vs_out.color = vec3<f32>(outputColor);
    return vs_out;
}

@fragment
fn fragment(
    @location(0) in_color: vec3<f32>
) -> @location(0) vec4<f32> {
    return vec4<f32>(in_color, 1.0);
}