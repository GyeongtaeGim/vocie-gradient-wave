const smoothingFactor = 1;
const minFrequency = 20.0;
const maxFrequency = 140.0;

/**
 * @description 3D Perlin noise 기능입니다.
 * 이 GLSL 코드는 3D Perlin 노이즈를 생성하는 함수들을 포함하고 있습니다.
 * Perlin 노이즈는 자연스러운 랜덤 패턴을 생성하는 데 사용되며, 주로 텍스처 생성, 지형 생성 등 다양한 그래픽스 분야에서 활용됩니다.
 */
const noiseGLSL = `
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

    float cnoise(vec3 P) {
        vec3 Pi0 = floor(P);
        vec3 Pi1 = Pi0 + vec3(1.0);
        Pi0 = mod(Pi0, 289.0);
        Pi1 = mod(Pi1, 289.0);
        vec3 Pf0 = fract(P);
        vec3 Pf1 = Pf0 - vec3(1.0);
        vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
        vec4 iy = vec4(Pi0.yy, Pi1.yy);
        vec4 iz0 = Pi0.zzzz;
        vec4 iz1 = Pi1.zzzz;

        vec4 ixy = permute(permute(ix) + iy);
        vec4 ixyz0 = permute(ixy + iz0);
        vec4 ixyz1 = permute(ixy + iz1);

        vec4 gx0 = ixyz0 / 7.0;
        vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
        gx0 = fract(gx0);
        vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
        vec4 sz0 = step(gz0, vec4(0.0));
        gx0 -= sz0 * (step(0.0, gx0) - 0.5);
        gy0 -= sz0 * (step(0.0, gy0) - 0.5);

        vec4 gx1 = ixyz1 / 7.0;
        vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
        gx1 = fract(gx1);
        vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
        vec4 sz1 = step(gz1, vec4(0.0));
        gx1 -= sz1 * (step(0.0, gx1) - 0.5);
        gy1 -= sz1 * (step(0.0, gy1) - 0.5);

        vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
        vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
        vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
        vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
        vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
        vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
        vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
        vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

        vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
        vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
        g000 *= norm0.x;
        g010 *= norm0.y;
        g100 *= norm0.z;
        g110 *= norm0.w;
        g001 *= norm1.x;
        g011 *= norm1.y;
        g101 *= norm1.z;
        g111 *= norm1.w;

        float n000 = dot(g000, Pf0);
        float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
        float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
        float n110 = dot(g110, vec3(Pf1.x, Pf1.y, Pf0.z));
        float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
        float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
        float n011 = dot(g011, vec3(Pf0.x, Pf1.y, Pf1.z));
        float n111 = dot(g111, Pf1);

        vec3 fade_Pf0 = fade(Pf0);
        vec3 fade_Pf1 = fade(Pf1);

        float rz0 = mix(mix(n000, n100, fade_Pf0.x),
                        mix(n010, n110, fade_Pf0.x), fade_Pf0.y);
        float rz1 = mix(mix(n001, n101, fade_Pf0.x),
                        mix(n011, n111, fade_Pf0.x), fade_Pf0.y);
        return 2.2 * mix(rz0, rz1, fade_Pf0.z);
    }
`;

let scene, camera, renderer;
let analyser, audioContext, microphone;
let dataArray;

let accumulatedTime = 0.0;
let lastFrameTime = 0;
let smoothedAvgFrequency = 0;

let liquidMesh;

async function setupAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(microphone);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        source.connect(analyser);

        initThreeJS();
        requestAnimationFrame(animate);

        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.style.display = 'none';
        }

    } catch (err) {
        alert("마이크 접근 권한이 필요합니다. 페이지를 새로고침하고 권한을 허용해주세요.");
    }
}

function initThreeJS() {
    scene = new THREE.Scene({ background: new THREE.Color(0x00000000) });

    const aspectRatio = window.innerWidth / window.innerHeight;

    camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
    camera.position.set(0, 8, 100);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);

    const planeWidth = 500;
    const planeHeight = 500;
    const segments = 256;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, segments, segments);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uAudioStrength: { value: 0.0 },
            uNoiseDensity: { value: 0.02 },
            uNoiseSpeed: { value: 0.5 },
            uDisplacementStrength: { value: 20.0 },
            uStartColor: { value: new THREE.Color(0x0000FF) },// 파랑
            uMidColor: { value: new THREE.Color(0x00FF00) },// 그린
            uEndColor: { value: new THREE.Color(0x800080) },// 퍼플
            uPlaneWidth: { value: planeWidth },
            uPlaneHeight: { value: planeHeight },
            uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.5).normalize() }
        },
        vertexShader: `
            ${noiseGLSL}
            uniform float uTime;
            uniform float uAudioStrength;
            uniform float uNoiseDensity;
            uniform float uNoiseSpeed;
            uniform float uDisplacementStrength;

            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vDisplacement;
            varying vec3 vPosition;

            void main() {
                vec3 newPosition = position;

                float noiseVal = cnoise(vec3(newPosition.x * uNoiseDensity, newPosition.y * uNoiseDensity, uTime * uNoiseSpeed));

                vDisplacement = noiseVal * uAudioStrength * uDisplacementStrength;
                newPosition.z += vDisplacement;

                float epsilon = 0.01;
                float noiseX1 = cnoise(vec3((position.x + epsilon) * uNoiseDensity, position.y * uNoiseDensity, uTime * uNoiseSpeed));
                float noiseY1 = cnoise(vec3(position.x * uNoiseDensity, (position.y + epsilon) * uNoiseDensity, uTime * uNoiseSpeed));
                float noiseX0 = cnoise(vec3((position.x - epsilon) * uNoiseDensity, position.y * uNoiseDensity, uTime * uNoiseSpeed));
                float noiseY0 = cnoise(vec3(position.x * uNoiseDensity, (position.y - epsilon) * uNoiseDensity, uTime * uNoiseSpeed));

                float dx = noiseX1 - noiseX0;
                float dy = noiseY1 - noiseY0;

                vNormal = normalize(vec3(-dx * uDisplacementStrength, -dy * uDisplacementStrength, 1.0));

                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                vViewDir = normalize(cameraPosition - newPosition);
                vPosition = position;
            }
        `,
        fragmentShader: `
            uniform vec3 uStartColor;
            uniform vec3 uMidColor;
            uniform vec3 uEndColor;
            uniform float uPlaneWidth;
            uniform float uPlaneHeight;
            uniform vec3 uLightDirection;

            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vDisplacement;
            varying vec3 vPosition;

            void main() {
                float xNormalized = (vPosition.x + uPlaneWidth / 2.0) / uPlaneWidth;
                float yNormalized = (vPosition.y + uPlaneHeight / 2.0) / uPlaneHeight;
                float zNormalized = (vDisplacement + 20.0) / (2.0 * 20.0);
                zNormalized = clamp(zNormalized, 0.0, 1.0);

                vec3 colorXY = mix(uStartColor, uMidColor, xNormalized);
                
                vec3 finalColor = mix(colorXY, uEndColor, zNormalized);
                // 환경 조명에 의한 밝기 조정 더 밝게하려면 아래 줄 값을 조정.
                float ambientFactor = 1.5;
                float diffuseFactor = max(dot(vNormal, uLightDirection), 0.0) * 1.0;
                
                float displacementBrightness = vDisplacement * 0.1;

                float brightnessFactor = ambientFactor + diffuseFactor + displacementBrightness;
                brightnessFactor = clamp(brightnessFactor, 1.0, 1.5);

                gl_FragColor = vec4(finalColor * brightnessFactor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });

    liquidMesh = new THREE.Mesh(geometry, material);
    liquidMesh.rotation.x = -Math.PI / 2;
    scene.add(liquidMesh);

    const ambientLight = new THREE.AmbientLight(0xffffff, 10);
    scene.add(ambientLight);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    const aspectRatio = window.innerWidth / window.innerHeight;
    camera.aspect = aspectRatio;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(currentTime) {
    requestAnimationFrame(animate);

    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    if (analyser) {
        if (audioContext.state === 'running') {
            analyser.getByteFrequencyData(dataArray);
        } else {
            dataArray.fill(0);
        }

        let sumFrequency = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sumFrequency += dataArray[i];
        }
        let avgFrequency = sumFrequency / dataArray.length;
        if (isNaN(avgFrequency)) {
            avgFrequency = 0;
        }

        smoothedAvgFrequency = Math.min(Math.max(minFrequency, smoothedAvgFrequency * (1 - smoothingFactor) + avgFrequency * smoothingFactor), maxFrequency);
        if (liquidMesh && liquidMesh.material && liquidMesh.material.uniforms) {
            liquidMesh.material.uniforms.uTime.value += deltaTime;

            const audioScaled = (smoothedAvgFrequency / 255.0) * 2.0;
            liquidMesh.material.uniforms.uAudioStrength.value = audioScaled;
        }
    }

    renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', setupAudio);
    }
});