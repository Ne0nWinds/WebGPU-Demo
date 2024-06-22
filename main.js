const { mat4, vec4 } = wgpuMatrix;

function assert(expr, assertMessage) {
    if (!(expr)) {
        assertMessage = (assertMessage != undefined) ? assertMessage : "An error occurred!";
        console.trace();


        const canvasElement = document.getElementById("canvas");
        canvasElement.style.display = "none";

        const errorElement = document.getElementById("error");
        errorElement.style.display = "block";
        errorElement.innerText = assertMessage;

        throw assertMessage;
    }
}

const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function createDepthTexture(device) {
    const depthTextureDescription = {
        size: [canvas.width, canvas.height, 1],
        dimension: "2d",
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    };
    const depthTexture = device.createTexture(depthTextureDescription);
    return depthTexture;
};

function tesselatePositions(amount) {
    const resolution = amount + 1;
    const n = Math.imul(resolution, resolution);
    const positions = new Float32Array(n * 3);
    const indices = new Uint16Array(amount * amount * 6);

    const increment = 2.0 / amount;
    for (let y = 0; y < (amount + 1); ++y) {
        for (let x = 0; x < (amount + 1); ++x) {
            const positionIndex = Math.imul(y * resolution + x, 3);
            positions[positionIndex + 0] = x * increment - 1.0;
            positions[positionIndex + 1] = 0.0;
            positions[positionIndex + 2] = y * increment - 1.0;
        }
    }

    for (let y = 0; y < amount; ++y) {
        for (let x = 0; x < amount; ++x) {
            const baseIndex = y * resolution + x;
            const arrayIndex = (y * 6 * amount) + (x * 6);

            const p0 = baseIndex;
            const p1 = baseIndex + 1;
            const p2 = p1 + resolution;
            const p3 = p0 + resolution;
            indices[arrayIndex + 0] = p0;
            indices[arrayIndex + 1] = p1;
            indices[arrayIndex + 2] = p2;
            indices[arrayIndex + 3] = p0;
            indices[arrayIndex + 4] = p2;
            indices[arrayIndex + 5] = p3;
        }
    }
    return [positions, indices];
}

void async function init() {
    const gpu = navigator.gpu;
    assert(gpu, "WebGPU is not supported on this browser!");

    const ctx = canvas.getContext("webgpu");
    assert(ctx, "WebGPU is not supported on this browser!");

    const adapter = await gpu.requestAdapter();
    assert(!!adapter, "Unable to request GPU adapter");
    const device = await adapter.requestDevice();
    assert(!!device, "Unable to initialize GPU Device");
    const queue = device.queue;

    const config = {
        device: device,
        format: "bgra8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        alphaMode: "opaque"
    };

    ctx.configure(config);
    let depthTexture = createDepthTexture(device);
    let depthTextureView = depthTexture.createView();

    let colorTexture = ctx.getCurrentTexture();
    let colorTextureView = colorTexture.createView();

    const createBuffer = (array, usage) => {
        let description = {
            size: (array.byteLength + 3) & ~3,
            usage: usage,
            mappedAtCreation: true
        };

        let buffer = device.createBuffer(description);
        const writeArray =
            array instanceof Uint16Array
            ?  new Uint16Array(buffer.getMappedRange())
            : new Float32Array(buffer.getMappedRange());

        writeArray.set(array);
        buffer.unmap();
        return buffer;
    };

    const tesselationAmount = 10;
    const [positions, indices] = tesselatePositions(tesselationAmount);

    const positionBuffer = createBuffer(positions, GPUBufferUsage.VERTEX);
    const indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);

    const fetchShaderCode = async (path) => {
        const response = await fetch(path);
        const txt = await response.text();
        return txt;
    }

    const shaderDescription = { code: await fetchShaderCode("triangle.wgsl") }
    const vertexModule = device.createShaderModule(shaderDescription);
    const fragmentModule = device.createShaderModule(shaderDescription);


    const uniformData = new Float32Array(16 + 4);
    const uniformBuffer = createBuffer(uniformData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    const uniformBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {}
            }
        ]
    });

    const uniformBindGroup = device.createBindGroup({
        layout: uniformBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            }
        ]
    });

    // Input Assembly
    const positionAttribDesc = {
        shaderLocation: 0,
        offset: 0,
        format: "float32x3"
    };
    const colorAttribDesc = {
        shaderLocation: 1,
        offset: 0,
        format: "float32x3"
    };
    const positionBufferDesc = {
        attributes: [positionAttribDesc],
        arrayStride: 4 * 3,
        stepMode: "vertex"
    };

    // Depth
    const depthStencil = {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8"
    };

    // Uniform Data
    const pipelineLayoutDescription = { bindGroupLayouts: [uniformBindGroupLayout] };
    const layout = device.createPipelineLayout(pipelineLayoutDescription);

    // Shader Stages
    const vertex = {
        module: vertexModule,
        entryPoint: "vertex",
        buffers: [positionBufferDesc]
    };

    const colorState = {
        format: "bgra8unorm"
    };

    const fragment = {
        module: fragmentModule,
        entryPoint: "fragment",
        targets: [colorState]
    };

    const primitive = {
        frontFace: "cw",
        cullMode: "none",
        topology: "triangle-list"
    };

    const pipelineDescription = {
        layout,
        vertex,
        fragment,
        primitive,
        depthStencil
    };

    const pipeline = device.createRenderPipeline(pipelineDescription);

    const encodeCommands = () => {
        const colorAttachment = {
            view: colorTextureView,
            clearValue: { r:0, g:0, b: 0, a: 1},
            loadOp: "clear",
            storeOp: "store"
        };

        const depthAttachment = {
            view: depthTextureView,
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilClearValue: 0,
            stencilLoadOp: "clear",
            stencilStoreOp: "store",
        };

        const renderPassDesc = {
            colorAttachments: [colorAttachment],
            depthStencilAttachment: depthAttachment
        };


        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
        passEncoder.setPipeline(pipeline);
        passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
        passEncoder.setVertexBuffer(0, positionBuffer);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.setIndexBuffer(indexBuffer, "uint16");
        passEncoder.drawIndexed(tesselationAmount * tesselationAmount * 6);
        passEncoder.end();

        queue.submit([commandEncoder.finish()]);
    };

    let animationID = 0;
    const render = (t) => {
        const c = Math.cos(t / 4096) * 2.0;
        const s = Math.sin(t / 4096) * 2.0;

        const lookAt = mat4.lookAt([s, 1.5, c], [0, 0, 0], [0, 1, 0]);
        const perspective = mat4.perspective(90 * (Math.PI / 180.0), canvas.width / canvas.height, 0.1, 1024.0);
        const m = mat4.mul(perspective, lookAt);

        const v = vec4.create();
        v[0] = t;

        uniformData.set(m, 0);
        uniformData.set(v, 16);

        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        colorTexture = ctx.getCurrentTexture();
        colorTextureView = colorTexture.createView();

        encodeCommands();

        animationID = requestAnimationFrame(render);
    };

    animationID = requestAnimationFrame(render);

    window.onresize = (e) => {
        cancelAnimationFrame(animationID);

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        depthTexture.destroy();
        depthTexture = createDepthTexture(device);
        depthTextureView = depthTexture.createView();

        requestAnimationFrame(render);
    };
}();