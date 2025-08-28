import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// === DOM ELEMENT REFERENCES ===
const uploadInput = document.getElementById('gerber-upload');
const threeContainer = document.getElementById('view-3d');
const loadingMessage = document.getElementById('loading-message');

// Sidebar elements
const sidebar = document.getElementById('sidebar');
const topThumbContainer = document.getElementById('view-2d-top-thumb');
const bottomThumbContainer = document.getElementById('view-2d-bottom-thumb');
const downloadTopBtn = document.getElementById('download-top-svg');
const downloadBottomBtn = document.getElementById('download-bottom-svg');
// PNG Export elements
const dpiTopInput = document.getElementById('dpi-top-input');
const dpiBottomInput = document.getElementById('dpi-bottom-input');
const downloadTopPngBtn = document.getElementById('download-top-png');
const downloadBottomPngBtn = document.getElementById('download-bottom-png');


// Navbar controls
const soldermaskBtnGroup = document.getElementById('soldermask-colors');
const silkscreenBtnGroup = document.getElementById('silkscreen-colors');
const copperFinishBtnGroup = document.getElementById('copper-finish');

// === THREE.JS SHARED VARIABLES ===
let scene, camera, renderer, controls, pcbGroup, svgLoader;

// === DATA STORE ===
let loadedLayers = [];
let currentStackup = null; // Store the latest stackup result for exports

// === CONSTANTS ===
const MM_PER_INCH = 25.4;

// === INITIALIZATION & EVENT LISTENERS ===
initThree();
uploadInput.addEventListener('change', handleFileSelect);

// Listen for clicks on the color/finish option buttons
soldermaskBtnGroup.addEventListener('click', handleOptionChange);
silkscreenBtnGroup.addEventListener('click', handleOptionChange);
copperFinishBtnGroup.addEventListener('click', handleOptionChange);

// Listen for clicks on the PNG download buttons
downloadTopPngBtn.addEventListener('click', () => handlePngExport('top'));
downloadBottomPngBtn.addEventListener('click', () => handlePngExport('bottom'));


// === CORE LOGIC ===

function getActiveColor(group) {
    const activeButton = group.querySelector('.btn.active');
    return activeButton ? activeButton.dataset.color : null;
}

function handleOptionChange(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const group = button.parentElement;
    // Update active state in the button group
    group.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Re-render views if we have layer data
    if (loadedLayers.length > 0) {
        renderAllViews(loadedLayers);
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

    // Get current colors from active buttons
    const soldermaskColor = getActiveColor(soldermaskBtnGroup);
    const silkscreenColor = getActiveColor(silkscreenBtnGroup);
    const finishedCopperColor = getActiveColor(copperFinishBtnGroup);

    // *** MODIFICATION START ***
    // Make soldermask opacity conditional for better color representation.
    // Opaque colors (black, white) should not be transparent, while others should be.
    let soldermaskAlpha;
    if (soldermaskColor === '#000000' || soldermaskColor === '#FFFFFF') {
        soldermaskAlpha = 0.95; // Nearly opaque for solid colors
    } else {
        soldermaskAlpha = 0.75; // Standard transparency for others
    }
    const soldermaskRgba = hexToRgba(soldermaskColor, soldermaskAlpha);
    // *** MODIFICATION END ***

    const options = {
        color: {
          sm: soldermaskRgba,
          ss: silkscreenColor,
          cu: '#C09548',
          fr4: '#ECD39E',
          cf: finishedCopperColor,
          sp: '#999',
          out: '#000'
        }
    };

    pcbStackup(layersCopy, options)
        .then(stackup => {
            currentStackup = stackup; // Cache the result
            // Update the 3D view first
            update3DView(stackup);

            let hasContent = false;

            // Populate top view thumbnail and download link
            if (stackup && stackup.top && stackup.top.svg) {
                topThumbContainer.innerHTML = stackup.top.svg;
                const topSvgBlob = new Blob([stackup.top.svg], { type: 'image/svg+xml;charset=utf-8' });
                downloadTopBtn.href = URL.createObjectURL(topSvgBlob);
                downloadTopBtn.classList.remove('disabled');
                downloadTopPngBtn.classList.remove('disabled'); // Enable PNG button
                hasContent = true;
            } else {
                topThumbContainer.innerHTML = '<p class="text-muted text-center small p-2">No top view generated.</p>';
                downloadTopBtn.href = '#';
                downloadTopBtn.classList.add('disabled');
                downloadTopPngBtn.classList.add('disabled'); // Disable PNG button
            }

            // Populate bottom view thumbnail and download link
            if (stackup && stackup.bottom && stackup.bottom.svg) {
                bottomThumbContainer.innerHTML = stackup.bottom.svg;
                const bottomSvgBlob = new Blob([stackup.bottom.svg], { type: 'image/svg+xml;charset=utf-8' });
                downloadBottomBtn.href = URL.createObjectURL(bottomSvgBlob);
                downloadBottomBtn.classList.remove('disabled');
                downloadBottomPngBtn.classList.remove('disabled'); // Enable PNG button
                hasContent = true;
            } else {
                bottomThumbContainer.innerHTML = '<p class="text-muted text-center small p-2">No bottom view generated.</p>';
                downloadBottomBtn.href = '#';
                downloadBottomBtn.classList.add('disabled');
                downloadBottomPngBtn.classList.add('disabled'); // Disable PNG button
            }

            loadingMessage.style.display = 'none';
        })
        .catch(handleError);
}

function handleError(error) {
    console.error('An error occurred:', error);
    alert('An error occurred processing the Gerber files. Check the console for details.');
    loadingMessage.style.display = 'none';
}

// === PNG EXPORT FUNCTION ===

function handlePngExport(side) {
    if (!currentStackup) {
        alert('No stackup data is available. Please load a file first.');
        return;
    }

    const viewData = currentStackup[side];
    const dpiInput = (side === 'top') ? dpiTopInput : dpiBottomInput;

    if (!viewData || !viewData.svg) {
        alert(`No ${side} view is available to export.`);
        return;
    }

    const dpi = parseInt(dpiInput.value, 10);
    if (isNaN(dpi) || dpi <= 0) {
        alert('Please enter a valid, positive DPI value.');
        return;
    }

    const { svg, width, height, units } = viewData;

    if (units !== 'mm') {
        console.warn(`PNG export for units "${units}" may be inaccurate. Assuming mm.`);
    }

    const widthInches = width / MM_PER_INCH;
    const heightInches = height / MM_PER_INCH;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthInches * dpi);
    canvas.height = Math.round(heightInches * dpi);
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url); // Clean up blob URL

        const pngUrl = canvas.toDataURL('image/png');

        // Trigger download
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${side}-view-${dpi}dpi.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    img.onerror = (err) => {
        console.error('Image loading for PNG conversion failed:', err);
        alert('An error occurred while preparing the PNG file. See console for details.');
        URL.revokeObjectURL(url);
    };

    img.src = url;
}


// === THREE.JS FUNCTIONS ===

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    camera = new THREE.PerspectiveCamera(50, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 5000);
    camera.position.set(200, 200, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    threeContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 1000;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.33);
    dirLight2.position.set(-100, -200, -100);
    scene.add(dirLight2);

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
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const { clientWidth, clientHeight } = threeContainer;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
}

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

            const baseResolution = 2048;
            canvas.width = baseResolution;
            canvas.height = baseResolution * (viewBoxHeight / viewBoxWidth);

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const tex = new THREE.CanvasTexture(canvas);
            tex.flipY = false;
            URL.revokeObjectURL(url);
            resolve(tex);
        };

        img.onerror = () => {
             URL.revokeObjectURL(url);
             reject(new Error("Failed to load SVG image for texture generation."));
        }
        img.src = url;
    });
}

async function update3DView(stackup) {
    pcbGroup.clear();

    if (!stackup || !stackup.layers) {
      console.error("Stackup or layers not found");
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
        const { viewBox, layer, width, height, units } = outlineLayer.converter;
        const pathData = layer.join('');
        const viewBoxWidth = viewBox[2] - viewBox[0];
        if (width && viewBoxWidth > 0) scale = width / viewBoxWidth;
        outlineSvg = `<svg width="${width}${units || 'mm'}" height="${height}${units || 'mm'}" viewBox="${viewBox.join(' ')}" version="1.1" xmlns="http://www.w3.org/2000/svg">${pathData}</svg>`;
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
    geometry.scale(-scale, -scale, 1);
    geometry.computeBoundingBox();
    geometry.center();

    const material = new THREE.MeshStandardMaterial({ color: 0xECD39E, roughness: 0.5, side: THREE.DoubleSide });
    const board = new THREE.Mesh(geometry, material);
    board.rotation.x = -Math.PI / 2;
    pcbGroup.add(board);

    const boardSize = new THREE.Vector3();
    geometry.boundingBox.getSize(boardSize);
    const [boardWidth, boardDepth, boardThickness] = [boardSize.x, boardSize.y, boardSize.z];

    // Create top texture overlay
    if (stackup.top && stackup.top.svg) {
        try {
            const topTex = await svgToTexture(stackup.top);
            topTex.wrapS = THREE.RepeatWrapping;
            topTex.repeat.x = -1;

            const planeGeom = new THREE.PlaneGeometry(boardWidth, boardDepth);
            const plane = new THREE.Mesh(planeGeom, new THREE.MeshStandardMaterial({ map: topTex, transparent: true, alphaTest: 0.5 }));
            plane.rotation.x = -Math.PI / 2;
            plane.position.y = (boardThickness / 2) + 0.1;
            pcbGroup.add(plane);
        } catch(e) {
             console.error("Failed to create top texture:", e);
        }
    }

    // Create bottom texture overlay
    if (stackup.bottom && stackup.bottom.svg) {
        try {
            const bottomTex = await svgToTexture(stackup.bottom);
            const planeGeom = new THREE.PlaneGeometry(boardWidth, boardDepth);
            const plane = new THREE.Mesh(planeGeom, new THREE.MeshStandardMaterial({ map: bottomTex, transparent: true, alphaTest: 0.5, side: THREE.BackSide }));
            plane.rotation.x = -Math.PI / 2;
            plane.position.y = -(boardThickness / 2) - 0.1;
            pcbGroup.add(plane);
        } catch(e) {
            console.error("Failed to create bottom texture:", e);
        }
    }

    // Auto-zoom camera to fit the new PCB
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

function getShapesFromSVG(svgString) {
    if (!svgString) {
        console.error("No SVG data provided to getShapesFromSVG");
        return [];
    }
    try {
        const paths = svgLoader.parse(svgString).paths;
        return paths.flatMap(p => p.toShapes(true));
    } catch (e) {
        console.warn('SVG parse failed, falling back to empty shapes:', e);
        return [];
    }
}
