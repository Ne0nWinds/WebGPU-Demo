"use strict";

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

    const depthTextureDescription = {
        size: [canvas.width, canvas.clientHeight, 1],
        dimension: "2d",
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    };
    const depthTexture = device.createTexture(depthTextureDescription);
    const depthTextureView = depthTexture.createView();

    let colorTexture = ctx.getCurrentTexture();
    let colorTextureView = colorTexture.createView();

    const positions = new Float32Array([
        0.5, -0.5, 0.0,
        -0.5, -0.5, 0.0,
        0.0, 0.5, 0.0
    ]);
    const colors = new Float32Array([
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0,
    ]);
    const indices = new Uint16Array([0, 1, 2]);

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

    const positionBuffer = createBuffer(positions, GPUBufferUsage.VERTEX);
    const colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
    const indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);

    const fetchShaderCode = async (path) => {
        const response = await fetch(path);
        const txt = await response.text();
        return txt;
    }

    const shaderDescription = { code: await fetchShaderCode("triangle.wgsl") }
    const vertexModule = device.createShaderModule(shaderDescription);
    const fragmentModule = device.createShaderModule(shaderDescription);

    const uniformData = new Float32Array([
        1.0, 1.0, 0.0, 0.0
    ]);
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
    const colorBufferDesc = {
        attributes: [colorAttribDesc],
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
        buffers: [positionBufferDesc, colorBufferDesc]
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
        passEncoder.setVertexBuffer(1, colorBuffer);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.setIndexBuffer(indexBuffer, "uint16");
        passEncoder.drawIndexed(3);
        passEncoder.end();

        queue.submit([commandEncoder.finish()]);
    };

    const render = (t) => {
        uniformData.fill(t);
        console.log(t);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        colorTexture = ctx.getCurrentTexture();
        colorTextureView = colorTexture.createView();

        encodeCommands();

        requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
}();