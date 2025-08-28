import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// === DOM ELEMENT REFERENCES ===
const uploadInput = document.getElementById('gerber-upload');
const updateBtn = document.getElementById('update-colors-btn');
const silkColorInput = document.getElementById('silkscreen-color');
const solderColorInput = document.getElementById('soldermask-color');
const copperColorInput = document.getElementById('copper-color');
const topContainer = document.getElementById('view-2d-top');
const bottomContainer = document.getElementById('view-2d-bottom');
const threeContainer = document.getElementById('view-3d');
const loadingMessage = document.getElementById('loading-message');
const tabs = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

// === THREE.JS SHARED VARIABLES ===
let scene, camera, renderer, controls, pcbGroup, svgLoader;
let isThreeJsInitialized = false;

// === DATA STORE ===
let loadedLayers = [];
let lastStackup = null;

// === EVENT LISTENERS ===
uploadInput.addEventListener('change', handleFileSelect);
updateBtn.addEventListener('click', () => renderAllViews(loadedLayers));
tabs.forEach(tab => tab.addEventListener('click', handleTabSwitch));

// === CORE LOGIC ===

function handleTabSwitch(event) {
    const targetTab = event.currentTarget.dataset.tab;
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById(targetTab).classList.add('active');

    if (targetTab === 'view-3d') {
        if (!isThreeJsInitialized) {
            initThree();
            isThreeJsInitialized = true;
            // If we have data already, render it now
            if (lastStackup) {
                update3DView(lastStackup);
            }
        }
        onWindowResize(); // Always call resize
    }
}

function hexToRgba(hex, alpha) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    const r = parseInt(result[1], 16), g = parseInt(result[2], 16), b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadingMessage.style.display = 'block';
    updateBtn.disabled = true;

    JSZip.loadAsync(file)
        .then(zip => {
            const promises = [];
            loadedLayers = [];
            zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir) {
                    promises.push(zipEntry.async('string').then(content => {
                        loadedLayers.push({ filename: zipEntry.name, gerber: content });
                    }));
                }
            });
            return Promise.all(promises);
        })
        .then(() => renderAllViews(loadedLayers))
        .catch(handleError);
}

function renderAllViews(layers) {
    if (layers.length === 0) return;

    loadingMessage.style.display = 'block';
    const layersCopy = JSON.parse(JSON.stringify(layers));
    const soldermaskRgba = hexToRgba(solderColorInput.value, 0.75);

    // fr4	Substrate
    // cu	Copper
    // cf	Copper (finished)
    // sm	Soldermask
    // ss	Silkscreen
    // sp	Solderpaste
    // out	Board outline

    const options = {
        color: {
          sm: soldermaskRgba,
          ss: silkColorInput.value,
          cu: copperColorInput.value,
          fr4: '#ECD39E',
          cf: '#999',
          sp: '#999',
          out: '#000'
        }
    };

    pcbStackup(layersCopy, options)
        .then(stackup => {
            lastStackup = stackup;
            topContainer.innerHTML = stackup.top.svg;
            bottomContainer.innerHTML = stackup.bottom.svg;

            if (isThreeJsInitialized) {
                update3DView(stackup);
            }

            updateBtn.disabled = false;
            loadingMessage.style.display = 'none';
        })
        .catch(handleError);
}

function handleError(error) {
    console.error('An error occurred:', error);
    alert('An error occurred. Check the console for details.');
    loadingMessage.style.display = 'none';
}

// === THREE.JS FUNCTIONS ===

// === THREE.JS SETUP ===
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    camera = new THREE.PerspectiveCamera(50, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 5000);
    camera.position.set(200, 200, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    threeContainer.appendChild(renderer.domElement);

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 1000;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.33);
    dirLight2.position.set(-100, -200, -100);
    scene.add(dirLight2);

    // Grid and axes
    const grid = new THREE.GridHelper(500, 50, 0xcccccc, 0xcccccc);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(50));

    pcbGroup = new THREE.Group();
    scene.add(pcbGroup);

    svgLoader = new SVGLoader();

    window.addEventListener('resize', onWindowResize);
    animate();
}


function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && camera) renderer.render(scene, camera);
}

function onWindowResize() {
    if (!renderer) return;
    const { clientWidth, clientHeight } = threeContainer;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
}

// === SVG TO TEXTURE HELPER (ROBUST VERSION) ===
async function svgToTexture(stackupSide) {
    return new Promise((resolve, reject) => {
        const svgString = stackupSide.svg;
        if (!svgString || !stackupSide.viewBox) {
            return reject("Invalid stackup side data for texture generation");
        }

        const img = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const viewBoxWidth = stackupSide.viewBox[2] - stackupSide.viewBox[0];
            const viewBoxHeight = stackupSide.viewBox[3] - stackupSide.viewBox[1];

            if (viewBoxWidth <= 0 || viewBoxHeight <= 0) {
                 URL.revokeObjectURL(url);
                 return reject("Invalid viewBox dimensions for texture");
            }

            const baseResolution = 2048; // Px for the longer side
            if (viewBoxWidth >= viewBoxHeight) {
                canvas.width = baseResolution;
                canvas.height = baseResolution * (viewBoxHeight / viewBoxWidth);
            } else {
                canvas.height = baseResolution;
                canvas.width = baseResolution * (viewBoxWidth / viewBoxHeight);
            }

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const tex = new THREE.CanvasTexture(canvas);
            tex.flipY = false;
            URL.revokeObjectURL(url);
            resolve(tex);
        };

        img.onerror = (e) => {
             URL.revokeObjectURL(url);
             reject(new Error("Failed to load SVG image for texture generation."));
        }
        img.src = url;
    });
}

// === 3D PCB UPDATE ===
async function update3DView(stackup) {
    pcbGroup.clear();

    if (!stackup || !stackup.layers) {
      console.error("Stackup or layers not found")
      return;
    }

    const outlineLayer = stackup.layers.find(l => l.type === 'outline');

    if (!outlineLayer) {
        console.error("No outline layer found in stackup");
        return;
    }

    let outlineSvg;
    let scale = 1.0;

    if (outlineLayer.svg) {
        outlineSvg = outlineLayer.svg;
    } else if (outlineLayer.converter && outlineLayer.converter.layer && outlineLayer.converter.viewBox) {
        const viewBox = outlineLayer.converter.viewBox;
        const pathData = outlineLayer.converter.layer.join('');
        const width = outlineLayer.converter.width;
        const height = outlineLayer.converter.height;
        const units = outlineLayer.converter.units || 'mm';

        const viewBoxWidth = viewBox[2] - viewBox[0];
        if (width && viewBoxWidth > 0) {
            scale = width / viewBoxWidth;
        }

        outlineSvg = `<svg width="${width}${units}" height="${height}${units}" viewBox="${viewBox.join(' ')}" version="1.1" xmlns="http://www.w3.org/2000/svg">${pathData}</svg>`;
    } else {
        console.error("Outline layer found, but it contains no usable SVG data.");
        return;
    }

    const BOARD_THICKNESS = 1.6;

    const shapes = getShapesFromSVG(outlineSvg);
    if (shapes.length === 0) {
        console.error("Could not extract any shapes from the outline SVG.");
        return;
    }

    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: BOARD_THICKNESS, bevelEnabled: false });

    // Mirror X-axis of geometry, and keep Y-axis flip
    geometry.scale(-scale, -scale, 1);

    geometry.computeBoundingBox();
    geometry.center();

    const material = new THREE.MeshStandardMaterial({ color: 0xECD39E, roughness: 0.5, side: THREE.DoubleSide });
    const board = new THREE.Mesh(geometry, material);
    board.rotation.x = -Math.PI / 2;
    pcbGroup.add(board);

    const boardSize = new THREE.Vector3();
    geometry.boundingBox.getSize(boardSize);

    const boardWidth = boardSize.x;
    const boardDepth = boardSize.y;
    const boardThickness = boardSize.z;

    if (stackup.top && stackup.top.svg) {
        try {
            const topTex = await svgToTexture(stackup.top);

            // Mirror top texture to match mirrored geometry
            topTex.wrapS = THREE.RepeatWrapping;
            topTex.repeat.x = -1;

            const planeGeom = new THREE.PlaneGeometry(boardWidth, boardDepth);
            const plane = new THREE.Mesh(planeGeom, new THREE.MeshStandardMaterial({ map: topTex, transparent: true, alphaTest: 0.5, side: THREE.FrontSide }));
            plane.rotation.x = -Math.PI / 2;
            plane.position.y = (boardThickness / 2) + 0.1;
            pcbGroup.add(plane);
        } catch(e) {
             console.error("Failed to create top texture:", e);
        }
    }

    if (stackup.bottom && stackup.bottom.svg) {
        try {
            const bottomTex = await svgToTexture(stackup.bottom);

            bottomTex.wrapS = THREE.RepeatWrapping;
            bottomTex.repeat.x = -1;

            const planeGeom = new THREE.PlaneGeometry(boardWidth, boardDepth);
            const plane = new THREE.Mesh(planeGeom, new THREE.MeshStandardMaterial({ map: bottomTex, transparent: true, alphaTest: 0.5, side: THREE.FrontSide }));
            plane.rotation.x = Math.PI / 2; // Rotated to face downwards
            plane.rotation.z = Math.PI; // spin 180 around green axis
            plane.position.y = -(boardThickness / 2) - 0.1;
            pcbGroup.add(plane);
        } catch(e) {
            console.error("Failed to create bottom texture:", e);
        }
    }

    // Frame camera
    const box = new THREE.Box3().setFromObject(pcbGroup);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = (maxDim / Math.tan(fov / 2)) * 0.75;

    camera.position.set(maxDim * 0.6, cameraDistance, maxDim * 0.6);
    controls.target.set(0, 0, 0);
    controls.update();
}

// === SVG TO SHAPES HELPER ===
function getShapesFromSVG(svgString) {
    if (!svgString) {
        console.error("No SVG data provided to getShapesFromSVG");
        return [];
    }
    try {
        const paths = svgLoader.parse(svgString).paths;
        return paths.flatMap(p => p.toShapes(true));
    } catch (e) {
        console.warn('SVG parse failed, fallback to empty shapes:', e);
        return [];
    }
}
