// ===== SM64 Coop DX Character Mod Generator - Fase 2 (3D) =====

const bgMusic = document.getElementById('bgMusic');
const sfxClick = document.getElementById('sfxClick');
const sfxHover = document.getElementById('sfxHover');
const sfxSuccess = document.getElementById('sfxSuccess');

let musicOn = true;

document.addEventListener('click', () => {
  if (musicOn && bgMusic.paused) {
    const mv = document.getElementById('musicVolume');
    bgMusic.volume = mv ? parseInt(mv.value, 10) / 100 : 0.4;
    bgMusic.play().catch(() => {});
  }
}, { once: true });

document.getElementById('btnMusic').addEventListener('click', () => {
  playSfx(sfxClick);
  musicOn = !musicOn;
  if (musicOn) {
    bgMusic.play().catch(() => {});
    document.getElementById('btnMusic').textContent = 'Música: ON';
  } else {
    bgMusic.pause();
    document.getElementById('btnMusic').textContent = 'Música: OFF';
  }
});

function playSfx(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('mouseenter', () => playSfx(sfxHover));
});

function setupPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener('change', () => {
    preview.innerHTML = '';
    const file = input.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
}
setupPreview('lifeIcon', 'lifePreview');
setupPreview('menuIcon', 'menuPreview');

// ==================== THREE.JS ====================

let scene, camera, renderer, controls;
let transformControls = null;
let gizmoTarget = 'model'; // model | rig | bone
let currentModel = null;
let skeletonHelper = null;
let marioBones = [];
let marioSkeleton = null;
let marioRoot = null;
let isRigged = false;
let originalModelBackup = null;
let showSkeleton = false;
let zipFiles = {};          // nombre -> Blob/File
let zipTextures = [];       // {name, url, blob}
let appliedTexture = null;

const canvas = document.getElementById('threeCanvas');
const placeholder = document.getElementById('viewerPlaceholder');
const viewerContainer = document.getElementById('viewer3d');


// ===== Gizmo / TransformControls helpers =====
function fillBoneSelect() {
  const sel = document.getElementById('boneSelect');
  if (!sel || !marioBones) return;
  sel.innerHTML = '';
  marioBones.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

function syncSlidersFromModel() {
  // reserved: keep orbit in sync if needed
}

function attachGizmoTo(obj) {
  if (!transformControls || !obj) return;
  transformControls.attach(obj);
  transformControls.visible = true;
}

function detachGizmo() {
  if (!transformControls) return;
  transformControls.detach();
  transformControls.visible = false;
}

function applyGizmoTarget() {
  if (gizmoTarget === 'model') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'none';
    if (currentModel) attachGizmoTo(currentModel);
    else detachGizmo();
  } else if (gizmoTarget === 'rig') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'none';
    if (skeletonHelper) {
      skeletonHelper.visible = true;
      showSkeleton = true;
      const btn = document.getElementById('btnToggleSkeleton');
      if (btn) btn.textContent = 'Ocultar rig Mario';
      attachGizmoTo(skeletonHelper);
    } else detachGizmo();
  } else if (gizmoTarget === 'bone') {
    const wrap = document.getElementById('boneSelectWrap');
    if (wrap) wrap.style.display = 'block';
    if (skeletonHelper) {
      skeletonHelper.visible = true;
      showSkeleton = true;
    }
    const sel = document.getElementById('boneSelect');
    const name = sel ? sel.value : '';
    const bone = marioBones && marioBones.find((b) => b.name === name);
    if (bone) attachGizmoTo(bone);
    else detachGizmo();
  }
}

function setGizmoMode(mode) {
  if (!transformControls) return;
  transformControls.setMode(mode);
  const t = document.getElementById('gizmoModeTranslate');
  const r = document.getElementById('gizmoModeRotate');
  const s = document.getElementById('gizmoModeScale');
  if (t) t.classList.toggle('active-mode', mode === 'translate');
  if (r) r.classList.toggle('active-mode', mode === 'rotate');
  if (s) s.classList.toggle('active-mode', mode === 'scale');
}

function setupGizmoUI() {
  const setTarget = (t, btnId) => {
    gizmoTarget = t;
    ['gizmoTargetModel', 'gizmoTargetRig', 'gizmoTargetBone'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === btnId);
    });
    applyGizmoTarget();
  };

  document.getElementById('gizmoTargetModel')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('model', 'gizmoTargetModel');
  });
  document.getElementById('gizmoTargetRig')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('rig', 'gizmoTargetRig');
  });
  document.getElementById('gizmoTargetBone')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setTarget('bone', 'gizmoTargetBone');
  });
  document.getElementById('gizmoModeTranslate')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('translate');
  });
  document.getElementById('gizmoModeRotate')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('rotate');
  });
  document.getElementById('gizmoModeScale')?.addEventListener('click', () => {
    playSfx(sfxClick);
    setGizmoMode('scale');
  });
  document.getElementById('gizmoDetach')?.addEventListener('click', () => {
    playSfx(sfxClick);
    detachGizmo();
  });
  document.getElementById('boneSelect')?.addEventListener('change', () => {
    if (gizmoTarget === 'bone') applyGizmoTarget();
  });
}

function initThree() {
  const width = viewerContainer.clientWidth;
  const height = viewerContainer.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 3.5);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xa0c4ff, 0.4);
  dirLight2.position.set(-3, 2, -2);
  scene.add(dirLight2);

  const grid = new THREE.GridHelper(4, 20, 0x4a90d9, 0x1a1a2e);
  scene.add(grid);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 12;

  transformControls = new THREE.TransformControls(camera, renderer.domElement);
  transformControls.setSize(0.85);
  transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
  });
  transformControls.addEventListener('change', function () {
    syncSlidersFromModel();
  });
  scene.add(transformControls);

  createMarioGuide();
  setupGizmoUI();
  fillBoneSelect();
  window.addEventListener('resize', onResize);
  animate();
}

function createMarioGuide() {
  // Esqueleto aproximado al rig de Mario SM64 / Character Template
  // Jerarquía típica usada en Fast64 / Coop DX character mods
  const bones = [];
  const boneNames = [];

  function makeBone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones.push(b);
    boneNames.push(name);
    return b;
  }

  // Root
  const root = makeBone('Root', null, 0, 0, 0);

  // Torso
  const torso = makeBone('Torso', root, 0, 0.55, 0);

  // Head
  const head = makeBone('Head', torso, 0, 0.45, 0);

  // Brazos
  const lShoulder = makeBone('L_Shoulder', torso, -0.28, 0.28, 0);
  const lArm = makeBone('L_Arm', lShoulder, -0.22, -0.05, 0);
  const lHand = makeBone('L_Hand', lArm, -0.2, -0.02, 0);

  const rShoulder = makeBone('R_Shoulder', torso, 0.28, 0.28, 0);
  const rArm = makeBone('R_Arm', rShoulder, 0.22, -0.05, 0);
  const rHand = makeBone('R_Hand', rArm, 0.2, -0.02, 0);

  // Piernas
  const lHip = makeBone('L_Hip', root, -0.12, 0.5, 0);
  const lLeg = makeBone('L_Leg', lHip, 0, -0.28, 0);
  const lFoot = makeBone('L_Foot', lLeg, 0, -0.28, 0.05);

  const rHip = makeBone('R_Hip', root, 0.12, 0.5, 0);
  const rLeg = makeBone('R_Leg', rHip, 0, -0.28, 0);
  const rFoot = makeBone('R_Foot', rLeg, 0, -0.28, 0.05);

  // Dummy mesh para que SkeletonHelper tenga algo a lo que asociarse
  const dummyGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const dummyMat = new THREE.MeshBasicMaterial({ visible: false });
  const dummy = new THREE.SkinnedMesh(dummyGeo, dummyMat);

  const skeleton = new THREE.Skeleton(bones);
  dummy.add(root);
  dummy.bind(skeleton);

  const helper = new THREE.SkeletonHelper(dummy);
  helper.material.linewidth = 2;
  helper.visible = false;

  // Grupo contenedor
  const group = new THREE.Group();
  group.name = 'marioRig';
  group.add(dummy);
  group.add(helper);

  // Marcadores en las articulaciones (esferas) para ver mejor el rig
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x003322,
    transparent: true,
    opacity: 0.85
  });
  bones.forEach((bone) => {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), jointMat);
    bone.add(joint);
  });

  group.visible = false;
  scene.add(group);
  skeletonHelper = group;
  marioBones = bones;
  marioSkeleton = skeleton;
  marioRoot = root;

  console.log('Mario rig creado. Huesos:', boneNames);
}



function getBoneWorldPositions() {
  const positions = [];
  marioBones.forEach((bone) => {
    const v = new THREE.Vector3();
    bone.getWorldPosition(v);
    positions.push(v);
  });
  return positions;
}

function autoRigModel() {
  if (!currentModel) {
    alert('Primero sube un modelo');
    return;
  }
  if (!marioSkeleton || marioBones.length === 0) {
    alert('Rig de Mario no listo');
    return;
  }

  // Mostrar el rig
  if (skeletonHelper) {
    skeletonHelper.visible = true;
    showSkeleton = true;
    const btn = document.getElementById('btnToggleSkeleton');
    if (btn) btn.textContent = 'Ocultar rig Mario';
  }

  // Alinear escala del rig al modelo aproximadamente
  const box = new THREE.Box3().setFromObject(currentModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  const modelHeight = Math.max(size.y, 0.01);

  // El rig tiene altura aprox 1.3 unidades (pies a cabeza)
  const rigHeight = 1.3;
  const scaleFactor = modelHeight / rigHeight;
  if (skeletonHelper) {
    skeletonHelper.scale.setScalar(scaleFactor);
    // poner el root del rig en los pies del modelo
    skeletonHelper.position.y = box.min.y;
  }

  // Actualizar matrices de huesos
  if (marioRoot) marioRoot.updateMatrixWorld(true);

  const boneWorldPos = getBoneWorldPositions();

  const skinnedMeshes = [];
  const meshesToReplace = [];

  currentModel.traverse((child) => {
    if (!child.isMesh || child.isSkinnedMesh) return;
    meshesToReplace.push(child);
  });

  if (meshesToReplace.length === 0) {
    // Ya puede estar skinned o sin geometría
    const hasSkinned = (() => {
      let found = false;
      currentModel.traverse((c) => { if (c.isSkinnedMesh) found = true; });
      return found;
    })();
    if (hasSkinned) {
      isRigged = true;
      document.getElementById('rigStatus').textContent = 'Modelo ya tiene skin / rig aplicado';
      return;
    }
    alert('No se encontraron meshes para riggear');
    return;
  }

  meshesToReplace.forEach((mesh) => {
    const geo = mesh.geometry.clone();
    // Asegurar que está en non-indexed o mantener index
    const posAttr = geo.attributes.position;
    const vertexCount = posAttr.count;

    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);

    const localPos = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    mesh.updateMatrixWorld(true);

    for (let i = 0; i < vertexCount; i++) {
      localPos.fromBufferAttribute(posAttr, i);
      worldPos.copy(localPos).applyMatrix4(mesh.matrixWorld);

      // Encontrar los 2 huesos más cercanos
      let best1 = 0, best2 = 0;
      let d1 = Infinity, d2 = Infinity;
      for (let b = 0; b < boneWorldPos.length; b++) {
        const d = worldPos.distanceToSquared(boneWorldPos[b]);
        if (d < d1) {
          d2 = d1; best2 = best1;
          d1 = d; best1 = b;
        } else if (d < d2) {
          d2 = d; best2 = b;
        }
      }

      const dist1 = Math.sqrt(d1) + 0.0001;
      const dist2 = Math.sqrt(d2) + 0.0001;
      // Peso inverso a la distancia
      let w1 = 1 / dist1;
      let w2 = 1 / dist2;
      const sum = w1 + w2;
      w1 /= sum;
      w2 /= sum;

      // Si el segundo está muy lejos, 100% al primero
      if (dist2 > dist1 * 3) {
        w1 = 1; w2 = 0;
      }

      skinIndices[i * 4 + 0] = best1;
      skinIndices[i * 4 + 1] = best2;
      skinIndices[i * 4 + 2] = 0;
      skinIndices[i * 4 + 3] = 0;
      skinWeights[i * 4 + 0] = w1;
      skinWeights[i * 4 + 1] = w2;
      skinWeights[i * 4 + 2] = 0;
      skinWeights[i * 4 + 3] = 0;
    }

    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    // Material: asegurar skinning
    let mat = mesh.material;
    if (Array.isArray(mat)) {
      mat = mat.map((m) => {
        const nm = m.clone();
        nm.skinning = true;
        return nm;
      });
    } else {
      mat = mat.clone();
      mat.skinning = true;
    }

    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.name = mesh.name || 'skinned';
    skinned.castShadow = true;
    skinned.receiveShadow = true;

    // Copiar transform del mesh original relativo al parent
    skinned.position.copy(mesh.position);
    skinned.rotation.copy(mesh.rotation);
    skinned.scale.copy(mesh.scale);
    skinned.matrix.copy(mesh.matrix);
    skinned.matrixWorld.copy(mesh.matrixWorld);

    // Guardar world matrix del mesh original
    mesh.updateMatrixWorld(true);
    const worldMat = mesh.matrixWorld.clone();

    // Quitar mesh original
    const parent = mesh.parent;
    if (parent) parent.remove(mesh);

    // Poner skinned bajo el root del rig para compartir espacio de huesos
    if (marioRoot) {
      marioRoot.parent.add(skinned); // dummy / same parent as root
    } else if (skeletonHelper) {
      skeletonHelper.add(skinned);
    } else if (parent) {
      parent.add(skinned);
    }

    // Restaurar transform mundial
    skinned.matrix.copy(worldMat);
    skinned.matrix.decompose(skinned.position, skinned.quaternion, skinned.scale);
    skinned.updateMatrixWorld(true);

    // Bind
    skinned.bind(marioSkeleton);
    skinnedMeshes.push(skinned);
  });

  isRigged = true;
  const status = document.getElementById('rigStatus');
  if (status) {
    status.textContent = '✓ Riggeado con ' + skinnedMeshes.length + ' mesh(es). Prueba mover un hueso abajo.';
    status.style.color = '#5f5';
  }
  console.log('Auto-rig completado:', skinnedMeshes.length, 'meshes');
}

function testPose(boneName, axis, angleDeg) {
  if (!isRigged || !marioBones.length) return;
  const bone = marioBones.find((b) => b.name === boneName);
  if (!bone) return;
  const rad = THREE.MathUtils.degToRad(angleDeg);
  if (axis === 'x') bone.rotation.x = rad;
  if (axis === 'y') bone.rotation.y = rad;
  if (axis === 'z') bone.rotation.z = rad;
  bone.updateMatrixWorld(true);
}

function resetPose() {
  marioBones.forEach((b) => {
    b.rotation.set(0, 0, 0);
    b.updateMatrixWorld(true);
  });
  ['poseArmL', 'poseArmR', 'poseLegL', 'poseHead'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  ['poseArmLNum', 'poseArmRNum', 'poseLegLNum', 'poseHeadNum'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
}


function onResize() {
  if (!renderer || !camera) return;
  const width = viewerContainer.clientWidth;
  const height = viewerContainer.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

document.getElementById('modelFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  playSfx(sfxClick);
  placeholder.classList.add('hidden');

  // reset zip UI
  document.getElementById('zipInfo').classList.add('hidden');
  document.getElementById('texturesPanel').classList.add('hidden');
  document.getElementById('textureList').innerHTML = '';
  zipFiles = {};
  zipTextures = [];
  appliedTexture = null;

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'zip') {
    await handleZip(file);
  } else {
    const buf = await file.arrayBuffer();
    loadModelFromBuffer(buf, ext, file.name);
  }
});

async function handleZip(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const modelExts = ['fbx', 'glb', 'gltf', 'obj', 'dae'];
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga'];

    const models = [];
    zipTextures = [];
    zipFiles = {};

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const name = path.split('/').pop();
      const e = name.split('.').pop().toLowerCase();
      const blob = await entry.async('blob');
      zipFiles[name.toLowerCase()] = { blob, name, path };

      if (modelExts.includes(e)) {
        const buf = await entry.async('arraybuffer');
        models.push({ name, path, ext: e, blob, buffer: buf, size: buf.byteLength });
      } else if (imageExts.includes(e)) {
        const url = URL.createObjectURL(blob);
        zipTextures.push({ name, path, url, blob });
      }
    }

    // Preferir formatos más fiables en el navegador
    const rank = { glb: 0, gltf: 1, fbx: 2, obj: 3, dae: 4 };
    models.sort((a, b) => (rank[a.ext] ?? 9) - (rank[b.ext] ?? 9) || b.size - a.size);

    console.log('ZIP modelos:', models.map(m => m.name + ' (' + m.ext + ', ' + m.size + ' bytes)'));
    console.log('ZIP texturas:', zipTextures.map(t => t.name));

    if (models.length === 0) {
      alert('No se encontró ningún modelo 3D en el ZIP (.fbx .glb .dae .obj)');
      placeholder.classList.remove('hidden');
      return;
    }

    // Llenar selector de modelos
    const sel = document.getElementById('zipModelSelect');
    sel.innerHTML = '';
    models.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m.name + ' (' + Math.round(m.size / 1024) + ' KB)';
      sel.appendChild(opt);
    });
    document.getElementById('zipInfo').classList.remove('hidden');

    // Mostrar texturas
    if (zipTextures.length > 0) {
      const list = document.getElementById('textureList');
      list.innerHTML = '';
      zipTextures.forEach((tex, i) => {
        const div = document.createElement('div');
        div.className = 'tex-item';
        div.dataset.index = i;
        div.innerHTML = '<img src="' + tex.url + '" alt="' + tex.name + '"><span>' + tex.name + '</span>';
        div.addEventListener('click', () => applyTextureManual(i));
        list.appendChild(div);
      });
      document.getElementById('texturesPanel').classList.remove('hidden');
    }

    // Cargar el mejor modelo (no siempre el primero del zip)
    const first = models[0];
    loadModelFromBuffer(first.buffer, first.ext, first.name);

    document.getElementById('btnLoadZipModel').onclick = () => {
      playSfx(sfxClick);
      const idx = parseInt(sel.value, 10);
      const m = models[idx];
      if (m) loadModelFromBuffer(m.buffer, m.ext, m.name);
    };

  } catch (err) {
    console.error(err);
    alert('Error al leer el ZIP');
    placeholder.classList.remove('hidden');
  }
}

function loadModelFromURL(url, ext, displayName) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  // Resolver texturas del ZIP por nombre de archivo (evita blob:null/...)
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((texUrl) => {
    try {
      const base = decodeURIComponent(texUrl.split('/').pop().split('?')[0]).toLowerCase();
      if (typeof zipTextures !== 'undefined' && zipTextures.length) {
        const found = zipTextures.find((t) => {
          const n = (t.name || '').toLowerCase();
          return n === base || n.endsWith('/' + base) || n.split('/').pop() === base;
        });
        if (found && found.blob) {
          return URL.createObjectURL(found.blob);
        }
        if (found && found.url) return found.url;
        if (found && found.dataUrl) return found.dataUrl;
      }
    } catch (e) {}
    // Evitar intentos file/blob rotos: devolver pixel transparente 1x1
    if (texUrl.indexOf('blob:') === 0 || texUrl.indexOf('file:') === 0) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    }
    return texUrl;
  });

  const onSuccess = (obj) => {
    currentModel = obj;
    prepareModel(currentModel);
    scene.add(currentModel);
    fitCameraToModel(currentModel);
    if (typeof attachGizmoTo === 'function' && gizmoTarget === 'model') {
      attachGizmoTo(currentModel);
    }
    console.log('Modelo cargado:', displayName, currentModel);
    placeholder.classList.add('hidden');
  };

  const onError = (err) => {
    console.error(err);
    alert('Error al cargar: ' + displayName + '\nAbre F12 para ver detalles.\nSi es FBX/DAE problemático, conviértelo a GLB en Blender.');
    placeholder.classList.remove('hidden');
  };

  if (ext === 'glb' || ext === 'gltf') {
    new THREE.GLTFLoader(manager).load(url, (gltf) => onSuccess(gltf.scene), undefined, onError);
  } else if (ext === 'fbx') {
    new THREE.FBXLoader(manager).load(url, onSuccess, undefined, onError);
  } else if (ext === 'dae') {
    new THREE.ColladaLoader(manager).load(url, (collada) => onSuccess(collada.scene), undefined, onError);
  } else if (ext === 'obj') {
    new THREE.OBJLoader(manager).load(url, (obj) => {
      obj.traverse((child) => {
        if (child.isMesh && !child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        }
      });
      onSuccess(obj);
    }, undefined, onError);
  } else {
    alert('Formato no soportado: ' + ext);
    placeholder.classList.remove('hidden');
  }
}


function loadModelFromBuffer(buffer, ext, displayName) {
  if (!buffer || buffer.byteLength < 16) {
    alert('Archivo vacío o corrupto: ' + displayName);
    return;
  }

  // Detectar si el "dae" no es XML o el fbx no parece fbx
  const head = new Uint8Array(buffer.slice(0, 64));
  const asText = String.fromCharCode.apply(null, head);
  if (ext === 'dae' && asText.indexOf('<') === -1) {
    console.warn('DAE no parece XML, se omite:', displayName);
    alert('Este .dae no es XML válido (¿binario o corrupto?): ' + displayName + '\\nPrueba el .fbx del mismo ZIP o exporta a GLB.');
    return;
  }
  if (ext === 'fbx' && asText.indexOf('Kaydara') === -1 && asText.indexOf('FBX') === -1) {
    // binary FBX starts with "Kaydara FBX Binary"
    // if neither, might still be binary with different header - try anyway if size > 100
    if (buffer.byteLength < 100) {
      alert('FBX inválido: ' + displayName);
      return;
    }
  }

  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((texUrl) => {
    try {
      const base = decodeURIComponent(texUrl.split('/').pop().split('?')[0]).toLowerCase();
      if (typeof zipTextures !== 'undefined' && zipTextures.length) {
        const found = zipTextures.find((t) => {
          const n = (t.name || '').toLowerCase();
          return n === base || n.split('/').pop() === base;
        });
        if (found && found.url) return found.url;
        if (found && found.blob) return URL.createObjectURL(found.blob);
      }
    } catch (e) {}
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  });

  const onSuccess = (obj) => {
    if (!obj) {
      alert('El loader no devolvió modelo: ' + displayName);
      return;
    }
    currentModel = obj;
    prepareModel(currentModel);
    scene.add(currentModel);
    fitCameraToModel(currentModel);
    if (typeof attachGizmoTo === 'function' && gizmoTarget === 'model') {
      attachGizmoTo(currentModel);
    }
    console.log('Modelo cargado:', displayName, currentModel);
    placeholder.classList.add('hidden');
  };

  const onError = (err) => {
    console.error(err);
    alert('Error al cargar: ' + displayName + '\\n' + (err && err.message ? err.message : err) + '\\n\\nTip: en Blender exporta como GLB (File → Export → glTF 2.0).');
    placeholder.classList.remove('hidden');
  };

  try {
    if (ext === 'glb' || ext === 'gltf') {
      new THREE.GLTFLoader(manager).parse(
        buffer,
        '',
        (gltf) => onSuccess(gltf.scene),
        onError
      );
    } else if (ext === 'fbx') {
      const loader = new THREE.FBXLoader(manager);
      const obj = loader.parse(buffer, '');
      onSuccess(obj);
    } else if (ext === 'dae') {
      const text = new TextDecoder().decode(buffer);
      if (text.trim()[0] !== '<') {
        alert('DAE inválido (no es XML): ' + displayName);
        return;
      }
      const loader = new THREE.ColladaLoader(manager);
      const result = loader.parse(text, '');
      if (!result || !result.scene) {
        alert('No se pudo parsear DAE: ' + displayName);
        return;
      }
      onSuccess(result.scene);
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const loader = new THREE.OBJLoader(manager);
      const obj = loader.parse(text);
      obj.traverse((child) => {
        if (child.isMesh && !child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        }
      });
      onSuccess(obj);
    } else {
      alert('Formato no soportado: ' + ext);
    }
  } catch (err) {
    onError(err);
  }
}

function getSelectedTexType() {
  const el = document.querySelector('input[name="texType"]:checked');
  return el ? el.value : 'full';
}

function applyTextureManual(index) {
  if (!currentModel || !zipTextures[index]) return;
  playSfx(sfxClick);

  const texType = getSelectedTexType();
  const tex = zipTextures[index];
  const loader = new THREE.TextureLoader();

  loader.load(tex.url, (texture) => {
    texture.encoding = THREE.sRGBEncoding;
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Guardar ref para ajustes de cara
    currentModel.userData.lastTexture = texture;
    currentModel.userData.lastTexType = texType;

    let targetMeshes = [];
    if (texType === 'full') {
      targetMeshes = listModelMeshes();
    } else if (texType === 'face') {
      targetMeshes = typeof getFaceTargetMeshes === 'function' ? getFaceTargetMeshes() : [];
      if (!targetMeshes.length) {
        // un solo mesh en el modelo → inevitablemente es ese
        const all = listModelMeshes();
        if (all.length === 1) targetMeshes = all;
        else {
          alert('No se detectó mesh de cara. Usa Expresiones → “Elegir mesh…” o marca Todo el modelo.');
          return;
        }
      }
      currentModel.userData.faceTargetUuids = targetMeshes.map((m) => m.uuid);
    } else if (texType === 'mask') {
      // máscara: preferir cuerpo, no cara
      const all = listModelMeshes();
      const body = all.filter((m) => !isFaceLikeMesh(m));
      targetMeshes = body.length ? body : all;
    }

    targetMeshes.forEach((child) => {
      const applyToMat = (mat) => {
        const m = mat.clone();
        m.map = texture;
        if (texType === 'mask') m.color = new THREE.Color(0xffffff);
        m.needsUpdate = true;
        return m;
      };
      if (Array.isArray(child.material)) {
        child.material = child.material.map(applyToMat);
      } else if (child.material) {
        child.material = applyToMat(child.material);
      } else {
        child.material = new THREE.MeshStandardMaterial({ map: texture });
      }
    });

    appliedTexture = tex;

    document.querySelectorAll('.tex-item').forEach(el => el.classList.remove('selected'));
    const item = document.querySelector('.tex-item[data-index="' + index + '"]');
    if (item) item.classList.add('selected');

    // Mostrar ajustes solo si es cara
    const faceAdj = document.getElementById('faceAdjust');
    if (texType === 'face') {
      faceAdj.classList.remove('hidden');
      // reset sliders
      document.getElementById('faceOffX').value = 0;
      document.getElementById('faceOffY').value = 0;
      document.getElementById('faceScale').value = 1;
      document.getElementById('faceOffXVal').textContent = '0.00';
      document.getElementById('faceOffYVal').textContent = '0.00';
      document.getElementById('faceScaleVal').textContent = '1.00';
    } else {
      faceAdj.classList.add('hidden');
    }

    console.log('Textura aplicada:', tex.name, 'tipo:', texType);
  });
}

function updateFaceUV() {
  if (!currentModel || !currentModel.userData.lastTexture) return;
  if (currentModel.userData.lastTexType !== 'face') return;

  const ox = parseFloat(document.getElementById('faceOffX').value);
  const oy = parseFloat(document.getElementById('faceOffY').value);
  const sc = parseFloat(document.getElementById('faceScale').value);

  document.getElementById('faceOffXVal').textContent = ox.toFixed(2);
  document.getElementById('faceOffYVal').textContent = oy.toFixed(2);
  document.getElementById('faceScaleVal').textContent = sc.toFixed(2);

  const texture = currentModel.userData.lastTexture;
  texture.offset.set(ox, oy);
  texture.repeat.set(sc, sc);
  texture.needsUpdate = true;
}

document.getElementById('faceOffX').addEventListener('input', updateFaceUV);
document.getElementById('faceOffY').addEventListener('input', updateFaceUV);
document.getElementById('faceScale').addEventListener('input', updateFaceUV);


document.getElementById('btnClearTexture').addEventListener('click', () => {
  playSfx(sfxClick);
  if (!currentModel) return;
  // No podemos restaurar fácil sin recargar; recargar es lo más limpio
  alert('Para quitar la textura, vuelve a cargar el modelo desde el selector del ZIP.');
});


function prepareModel(model) {
  // Centrar
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.x = -center.x;
  model.position.z = -center.z;
  model.position.y = -box.min.y;

  // Auto-escalar si el modelo es gigante o minúsculo
  const maxDim = Math.max(size.x, size.y, size.z);
  let autoScale = 1;

  if (maxDim > 5) {
    // Modelo muy grande (típico de FBX de Mario)
    autoScale = 1.8 / maxDim;
  } else if (maxDim < 0.3 && maxDim > 0) {
    // Modelo muy pequeño
    autoScale = 1.5 / maxDim;
  }

  if (autoScale !== 1) {
    model.scale.setScalar(autoScale);
    // Recalcular después de escalar
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y = -box2.min.y;
    console.log("Auto-escala aplicada:", autoScale, "tamaño original:", maxDim);
  }

  model.userData.baseY = model.position.y;
  model.userData.autoScale = autoScale;

  // Actualizar slider de escala
  const scaleSlider = document.getElementById("scale");
  scaleSlider.value = autoScale;
  document.getElementById("scaleVal").textContent = autoScale.toFixed(2);
}

function fitCameraToModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const dist = Math.max(maxDim * 2.5, 2.5);

  camera.position.set(dist * 0.8, Math.max(size.y * 0.5, 0.8) + 0.3, dist);
  controls.target.set(center.x, Math.max(center.y, 0.5), center.z);
  controls.update();

  console.log("Cámara ajustada. Tamaño modelo:", size, "dist:", dist);
}

const posYSlider = document.getElementById('posY');
const scaleSlider = document.getElementById('scale');
const rotYSlider = document.getElementById('rotY');

posYSlider.addEventListener('input', () => {
  const v = parseFloat(posYSlider.value);
  document.getElementById('posYVal').textContent = v.toFixed(2);
  if (currentModel) currentModel.position.y = (currentModel.userData.baseY || 0) + v;
});

scaleSlider.addEventListener('input', () => {
  const v = parseFloat(scaleSlider.value);
  document.getElementById('scaleVal').textContent = v.toFixed(2);
  if (currentModel) currentModel.scale.setScalar(v);
});

rotYSlider.addEventListener('input', () => {
  const v = parseFloat(rotYSlider.value);
  document.getElementById('rotYVal').textContent = v + '°';
  if (currentModel) currentModel.rotation.y = THREE.MathUtils.degToRad(v);
});

document.getElementById('btnResetView').addEventListener('click', () => {
  playSfx(sfxClick);
  posYSlider.value = 0;
  scaleSlider.value = 1;
  rotYSlider.value = 0;
  document.getElementById('posYVal').textContent = '0.00';
  document.getElementById('scaleVal').textContent = '1.00';
  document.getElementById('rotYVal').textContent = '0°';
  if (currentModel) {
    currentModel.position.y = currentModel.userData.baseY || 0;
    currentModel.scale.setScalar(1);
    currentModel.rotation.y = 0;
    fitCameraToModel(currentModel);
  }
});

document.getElementById('btnToggleSkeleton').addEventListener('click', () => {
  playSfx(sfxClick);
  showSkeleton = !showSkeleton;
  if (skeletonHelper) skeletonHelper.visible = showSkeleton;
  document.getElementById('btnToggleSkeleton').textContent =
    showSkeleton ? 'Ocultar rig Mario' : 'Mostrar rig Mario';
});

document.getElementById('btnAutoRig').addEventListener('click', () => {
  playSfx(sfxClick);
  autoRigModel();
});

document.getElementById('btnResetPose').addEventListener('click', () => {
  playSfx(sfxClick);
  resetPose();
});

const poseBindings = [
  { id: 'poseArmL', numId: 'poseArmLNum', bone: 'L_Arm', axis: 'z', invert: false },
  { id: 'poseArmR', numId: 'poseArmRNum', bone: 'R_Arm', axis: 'z', invert: true },
  { id: 'poseLegL', numId: 'poseLegLNum', bone: 'L_Leg', axis: 'x', invert: false },
  { id: 'poseHead', numId: 'poseHeadNum', bone: 'Head', axis: 'y', invert: false },
];

poseBindings.forEach(({ id, numId, bone, axis, invert }) => {
  const el = document.getElementById(id);
  const num = document.getElementById(numId);
  const apply = (raw) => {
    let v = parseFloat(raw) || 0;
    if (el) el.value = v;
    if (num) num.value = v;
    const poseV = invert ? -v : v;
    if (typeof isRigged !== 'undefined' && !isRigged) {
      // still try — bones exist even without skin
    }
    testPose(bone, axis, poseV);
  };
  if (el) el.addEventListener('input', () => apply(el.value));
  if (num) {
    num.addEventListener('input', () => apply(num.value));
    num.addEventListener('change', () => apply(num.value));
  }
});


window.addEventListener('load', initThree);

// ==================== GENERAR MOD ====================

document.getElementById('btnGenerate').addEventListener('click', async () => {
  playSfx(sfxClick);

  const name = document.getElementById('charName').value.trim() || 'Custom Character';
  const desc = document.getElementById('charDesc').value.trim() || 'A custom character';
  const author = document.getElementById('charAuthor').value.trim() || 'Unknown';
  const color = document.getElementById('charColor').value.replace('#', '');

  const lifeFile = document.getElementById('lifeIcon').files[0];
  const menuFile = document.getElementById('menuIcon').files[0];
  const jumpFile = document.getElementById('soundJump').files[0];
  const hurtFile = document.getElementById('soundHurt').files[0];
  const deathFile = document.getElementById('soundDeath').files[0];

  const status = document.getElementById('status');
  status.className = 'status';
  status.textContent = 'Generando mod...';

  try {
    const zip = new JSZip();
    const folderName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_character';
    const root = zip.folder(folderName);

    const mainLua = generateMainLua({
      name, desc, author, color, folderName,
      hasLifeIcon: !!lifeFile,
      hasMenuIcon: !!menuFile,
      hasJump: !!jumpFile,
      hasHurt: !!hurtFile,
      hasDeath: !!deathFile
    });

    root.file('main.lua', mainLua);

    const textures = root.folder('textures');
    if (lifeFile) textures.file('life_icon.png', lifeFile);
    if (menuFile) textures.file('menu_icon.png', menuFile);

    // HUD PNGs (sección UI)
    const dataUrlToBlob = async (dataUrl) => {
      const res = await fetch(dataUrl);
      return await res.blob();
    };
    // Expresiones de ojos/cara
    if (typeof faceStateData !== 'undefined' && typeof FACE_STATES !== 'undefined') {
      for (const s of FACE_STATES) {
        const d = faceStateData[s.id];
        if (!d || !d.dataUrl) continue;
        const url = await getTransformedFaceDataUrl(s.id);
        if (url) textures.file(s.file, await dataUrlToBlob(url));
      }
    }

    if (typeof hudFiles !== 'undefined') {
      if (hudFiles.powerMeter) {
        textures.file(hudFiles.powerMeter.name, await dataUrlToBlob(hudFiles.powerMeter.dataUrl));
      }
      if (hudFiles.lifeIcon && !lifeFile) {
        textures.file(hudFiles.lifeIcon.name, await dataUrlToBlob(hudFiles.lifeIcon.dataUrl));
      } else if (hudFiles.lifeIcon && lifeFile) {
        textures.file('life_icon_hud.png', await dataUrlToBlob(hudFiles.lifeIcon.dataUrl));
      }
      if (hudFiles.courseIcon) {
        textures.file(hudFiles.courseIcon.name, await dataUrlToBlob(hudFiles.courseIcon.dataUrl));
      }
      if (hudFiles.transition) {
        textures.file(hudFiles.transition.name, await dataUrlToBlob(hudFiles.transition.dataUrl));
      }
    }

    const sounds = root.folder('sound');
    if (jumpFile) sounds.file('jump.ogg', jumpFile);
    if (hurtFile) sounds.file('hurt.ogg', hurtFile);
    if (deathFile) sounds.file('death.ogg', deathFile);

    let modelNote = '';
    if (currentModel) {
      const scale = parseFloat(scaleSlider.value);
      const posY = parseFloat(posYSlider.value);
      const rotY = parseFloat(rotYSlider.value);
      modelNote = '\nAjustes 3D del visor:\n- Escala: ' + scale + '\n- Posición Y: ' + posY + '\n- Rotación Y: ' + rotY + '°\n\nEstos valores son de referencia. El modelo real debes exportarlo desde Blender con Fast64.\n';
    }

    root.file('README.txt', 'Mod generado automáticamente\nPersonaje: ' + name + '\nAutor: ' + author + '\n\nInstrucciones:\n1. Ten el mod Character Select instalado.\n2. Pon esta carpeta en mods/ de sm64coopdx.\n3. Activa el mod y reinicia.\n\nIMPORTANTE:\nTodavía necesitas el modelo 3D exportado con Fast64 (.bin / geo).\nLos PNG de HUD (power meter, life icon, etc.) van en textures/. Ajusta nombres según Character Select.\n' + modelNote);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, folderName + '_cs_mod.zip');

    status.textContent = '¡Mod generado con éxito! Revisa tus descargas.';
    playSfx(sfxSuccess);
  } catch (err) {
    console.error(err);
    status.className = 'status error';
    status.textContent = 'Error al generar el mod.';
  }
});

function generateMainLua(opts) {
  let s = '';
  s += '-- name: [CS] ' + opts.name + '\n';
  s += '-- description: ' + opts.desc.replace(/\n/g, ' ') + '\n';
  s += '-- deluxe: true\n\n';
  s += '-- Generado por SM64 Coop DX Character Mod Generator\n\n';
  s += 'local E_MODEL_CHAR = smlua_model_util_get_id("' + opts.folderName + '_geo")\n\n';

  if (opts.hasLifeIcon) {
    s += 'local TEX_LIFE_ICON = get_texture_info("life_icon")\n';
  } else {
    s += 'local TEX_LIFE_ICON = nil\n';
  }
  s += '\nlocal VOICETABLE = {\n';
  if (opts.hasJump) {
    s += '    [CHAR_SOUND_YAH_WAH_HOO] = audio_sample_load("sound/jump.ogg"),\n';
    s += '    [CHAR_SOUND_HOOHOO]     = audio_sample_load("sound/jump.ogg"),\n';
    s += '    [CHAR_SOUND_YAHOO]      = audio_sample_load("sound/jump.ogg"),\n';
  }
  if (opts.hasHurt) {
    s += '    [CHAR_SOUND_EEUH]       = audio_sample_load("sound/hurt.ogg"),\n';
    s += '    [CHAR_SOUND_OOOF]       = audio_sample_load("sound/hurt.ogg"),\n';
  }
  if (opts.hasDeath) {
    s += '    [CHAR_SOUND_DYING]      = audio_sample_load("sound/death.ogg"),\n';
  }
  s += '}\n\n';

  s += 'local function on_character_select_load()\n';
  s += '    if not _G.charSelect then\n';
  s += '        djui_popup_create("\\\\#ff6666\\\\Necesitas el mod Character Select!", 3)\n';
  s += '        return\n';
  s += '    end\n\n';
  s += '    local charNum = _G.charSelect.character_add(\n';
  s += '        "' + opts.name + '",\n';
  s += '        {"' + opts.desc.replace(/"/g, '\\"').replace(/\n/g, '", "') + '"},\n';
  s += '        "' + opts.author + '",\n';
  s += '        "' + opts.color + '",\n';
  s += '        E_MODEL_CHAR,\n';
  s += '        CT_MARIO,\n';
  s += '        TEX_LIFE_ICON\n';
  s += '    )\n\n';

  if (opts.hasJump || opts.hasHurt || opts.hasDeath) {
    s += '    _G.charSelect.character_add_voice(E_MODEL_CHAR, VOICETABLE)\n';
  }
  s += 'end\n\n';
  s += 'hook_event(HOOK_ON_MODS_LOADED, on_character_select_load)\n';
  return s;
}


function setLayout(mode) {
  document.body.classList.remove('layout-classic', 'layout-studio');
  document.body.classList.add(mode === 'studio' ? 'layout-studio' : 'layout-classic');
  document.getElementById('btnLayoutClassic').classList.toggle('active', mode !== 'studio');
  document.getElementById('btnLayoutStudio').classList.toggle('active', mode === 'studio');
  try { localStorage.setItem('cmg-layout', mode); } catch (e) {}
  // resize three.js canvas
  setTimeout(() => { if (typeof onResize === 'function') onResize(); }, 50);
}

document.getElementById('btnLayoutClassic').addEventListener('click', () => {
  playSfx(sfxClick);
  setLayout('classic');
});
document.getElementById('btnLayoutStudio').addEventListener('click', () => {
  playSfx(sfxClick);
  setLayout('studio');
});

// restore saved layout
(function () {
  let mode = 'classic';
  try { mode = localStorage.getItem('cmg-layout') || 'classic'; } catch (e) {}
  setLayout(mode);
})();


// ===== Settings panel =====
const settingsOverlay = document.getElementById('settingsOverlay');

function openSettings() {
  settingsOverlay.classList.remove('hidden');
}
function closeSettings() {
  settingsOverlay.classList.add('hidden');
}

document.getElementById('btnSettings').addEventListener('click', () => {
  playSfx(sfxClick);
  openSettings();
});
document.getElementById('btnCloseSettings').addEventListener('click', () => {
  playSfx(sfxClick);
  closeSettings();
});
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

// Volume
function applyMusicVolume() {
  const v = parseInt(document.getElementById('musicVolume').value, 10) / 100;
  document.getElementById('bgMusic').volume = v;
  document.getElementById('musicVolumeVal').textContent = Math.round(v * 100) + '%';
  try { localStorage.setItem('cmg-music-vol', String(Math.round(v * 100))); } catch (e) {}
}
function applySfxVolume() {
  const v = parseInt(document.getElementById('sfxVolume').value, 10) / 100;
  [sfxClick, sfxHover, sfxSuccess].forEach((a) => { if (a) a.volume = v; });
  document.getElementById('sfxVolumeVal').textContent = Math.round(v * 100) + '%';
  try { localStorage.setItem('cmg-sfx-vol', String(Math.round(v * 100))); } catch (e) {}
}

document.getElementById('musicVolume').addEventListener('input', applyMusicVolume);
document.getElementById('sfxVolume').addEventListener('input', applySfxVolume);

// restore volumes
(function () {
  try {
    const mv = localStorage.getItem('cmg-music-vol');
    const sv = localStorage.getItem('cmg-sfx-vol');
    if (mv != null) document.getElementById('musicVolume').value = mv;
    if (sv != null) document.getElementById('sfxVolume').value = sv;
  } catch (e) {}
  applyMusicVolume();
  applySfxVolume();
})();



// ===== Expresiones de cara / ojos =====
const FACE_STATES = [
  { id: 'normal', label: 'Normal', file: 'eyes_normal.png' },
  { id: 'half', label: 'Medio cerrados', file: 'eyes_half.png' },
  { id: 'closed', label: 'Cerrados', file: 'eyes_closed.png' },
  { id: 'dead', label: 'Muerto / KO', file: 'eyes_dead.png' },
];

const faceStateData = {};
let selectedFaceStateId = 'normal';
let faceBackupMaterials = null; // restore on clear

FACE_STATES.forEach((s) => {
  faceStateData[s.id] = {
    dataUrl: null,
    rotation: 0,
    flipH: false,
    flipV: false,
    eyeOffX: 0,
    eyeOffY: 0,
    eyeScale: 1,
  };
});

function buildFaceStatesUI() {
  const grid = document.getElementById('faceStatesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  FACE_STATES.forEach((s) => {
    const slot = document.createElement('div');
    slot.className = 'face-state-slot' + (s.id === selectedFaceStateId ? ' active' : '');
    slot.dataset.id = s.id;
    slot.innerHTML =
      '<span class="face-label">' + s.label + '</span>' +
      '<div class="face-thumb placeholder" data-thumb="' + s.id + '">Sin imagen</div>' +
      '<input type="file" accept="image/*" data-face="' + s.id + '">';
    slot.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      selectFaceState(s.id);
    });
    const input = slot.querySelector('input');
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const d = faceStateData[s.id];
        d.dataUrl = reader.result;
        d.rotation = 0;
        d.flipH = false;
        d.flipV = false;
        updateFaceThumb(s.id);
        selectFaceState(s.id);
      };
      reader.readAsDataURL(file);
    });
    grid.appendChild(slot);
  });
}

function selectFaceState(id) {
  selectedFaceStateId = id;
  document.querySelectorAll('.face-state-slot').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const sel = document.getElementById('faceStatePreview');
  if (sel) sel.value = id;
  const label = (FACE_STATES.find((s) => s.id === id) || {}).label || id;
  const hint = document.getElementById('faceEditHint');
  if (hint) hint.textContent = 'Editando: ' + label;

  // load eye sliders for this state
  const d = faceStateData[id];
  if (!d) return;
  const set = (id, val, valId, suffix) => {
    const el = document.getElementById(id);
    const v = document.getElementById(valId);
    if (el) el.value = val;
    if (v) v.textContent = typeof val === 'number' ? val.toFixed(2) + (suffix || '') : val;
  };
  const eox = document.getElementById('eyeOffX');
  const eoy = document.getElementById('eyeOffY');
  const esc = document.getElementById('eyeScale');
  const eoxn = document.getElementById('eyeOffXNum');
  const eoyn = document.getElementById('eyeOffYNum');
  const escn = document.getElementById('eyeScaleNum');
  if (eox) eox.value = d.eyeOffX;
  if (eoy) eoy.value = d.eyeOffY;
  if (esc) esc.value = d.eyeScale;
  if (eoxn) eoxn.value = d.eyeOffX;
  if (eoyn) eoyn.value = d.eyeOffY;
  if (escn) escn.value = d.eyeScale;
}

function updateFaceThumb(id) {
  const data = faceStateData[id];
  const el = document.querySelector('[data-thumb="' + id + '"]');
  if (!el || !data) return;
  if (!data.dataUrl) {
    el.className = 'face-thumb placeholder';
    el.textContent = 'Sin imagen';
    el.style.backgroundImage = '';
    return;
  }
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const rot = ((data.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(data.flipH ? -1 : 1, data.flipV ? -1 : 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    el.className = 'face-thumb';
    el.textContent = '';
    el.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
  };
  img.src = data.dataUrl;
}

function getTransformedFaceDataUrl(id) {
  return new Promise((resolve) => {
    const data = faceStateData[id];
    if (!data || !data.dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const rot = ((data.rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(data.flipH ? -1 : 1, data.flipV ? -1 : 1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = data.dataUrl;
  });
}

function backupFaceMaterials() {
  if (!currentModel || faceBackupMaterials) return;
  faceBackupMaterials = [];
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat, i) => {
      if (!mat) return;
      faceBackupMaterials.push({
        mesh: child,
        index: i,
        map: mat.map || null,
        isArray: Array.isArray(child.material),
      });
    });
  });
}


function listModelMeshes() {
  const meshes = [];
  if (!currentModel) return meshes;
  currentModel.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

function refreshFaceMeshSelect() {
  const sel = document.getElementById('faceMeshSelect');
  if (!sel) return;
  const meshes = listModelMeshes();
  sel.innerHTML = '';
  meshes.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = (m.name || ('Mesh_' + i)) + ' (' + (m.geometry?.attributes?.position?.count || '?') + ' verts)';
    sel.appendChild(opt);
  });
  if (!meshes.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No hay meshes — sube un modelo';
    sel.appendChild(opt);
  }
}

function isFaceLikeMesh(mesh) {
  const n = ((mesh.name || '') + ' ' + (mesh.parent && mesh.parent.name || '')).toLowerCase();
  const keys = ['face', 'head', 'eye', 'eyes', 'cara', 'cabeza', 'mouth', 'boca', 'hair_face', 'facial'];
  return keys.some((k) => n.indexOf(k) !== -1);
}

function getFaceTargetMeshes() {
  const mode = document.getElementById('faceTargetMode')?.value || 'auto';
  const meshes = listModelMeshes();
  if (!meshes.length) return [];

  if (mode === 'all') return meshes;

  if (mode === 'pick') {
    const sel = document.getElementById('faceMeshSelect');
    const idx = sel ? parseInt(sel.value, 10) : 0;
    if (meshes[idx]) return [meshes[idx]];
    return [];
  }

  // auto
  const liked = meshes.filter(isFaceLikeMesh);
  if (liked.length) return liked;

  // fallback: mesh más pequeño (a menudo la cara es menos polígonos que el cuerpo)
  // o el que tenga "body" excluido
  const nonBody = meshes.filter((m) => {
    const n = (m.name || '').toLowerCase();
    return n.indexOf('body') === -1 && n.indexOf('cuerpo') === -1 && n.indexOf('torso') === -1;
  });
  if (nonBody.length === 1) return nonBody;
  if (nonBody.length > 1) {
    nonBody.sort((a, b) => {
      const ca = a.geometry?.attributes?.position?.count || 0;
      const cb = b.geometry?.attributes?.position?.count || 0;
      return ca - cb;
    });
    return [nonBody[0]];
  }
  // último recurso: no aplicar a todo — pedir pick
  return [];
}

async function applyFaceStateToModel(id) {
  if (!currentModel) {
    alert('Sube un modelo primero');
    return;
  }
  const url = await getTransformedFaceDataUrl(id);
  if (!url) {
    alert('Esa expresión no tiene imagen todavía');
    return;
  }

  let targets = getFaceTargetMeshes();
  if (!targets.length) {
    refreshFaceMeshSelect();
    const modeEl = document.getElementById('faceTargetMode');
    if (modeEl) modeEl.value = 'pick';
    document.getElementById('faceMeshSelect')?.classList.remove('hidden');
    alert('No encontré un mesh de cara/cabeza por nombre.\\nElige el mesh a mano en “Elegir mesh…” y vuelve a Aplicar.');
    return;
  }

  backupFaceMaterials();
  const loader = new THREE.TextureLoader();
  loader.load(url, (texture) => {
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const d = faceStateData[id];
    texture.offset.set(d.eyeOffX, d.eyeOffY);
    texture.repeat.set(d.eyeScale, d.eyeScale);
    currentModel.userData.lastTexture = texture;
    currentModel.userData.lastTexType = 'face';
    currentModel.userData.activeFaceState = id;
    currentModel.userData.faceTargetUuids = targets.map((m) => m.uuid);

    targets.forEach((mesh) => {
      // Clonar material para no pintar otros meshes que compartan el mismo material
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => {
          const nm = mat.clone();
          nm.map = texture;
          nm.needsUpdate = true;
          return nm;
        });
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      }
    });

    console.log('Cara aplicada a', targets.map((t) => t.name || t.uuid));
  });
}

function applyEyeUVFromState(id) {
  const d = faceStateData[id] || { eyeOffX: 0, eyeOffY: 0, eyeScale: 1 };
  if (!currentModel) return;
  const uuids = currentModel.userData.faceTargetUuids;
  const ox = d.eyeOffX || 0;
  const oy = d.eyeOffY || 0;
  const sc = d.eyeScale || 1;
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    if (uuids && uuids.length && uuids.indexOf(child.uuid) === -1) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat) => {
      if (!mat || !mat.map) return;
      mat.map.wrapS = THREE.RepeatWrapping;
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.offset.set(ox, oy);
      mat.map.repeat.set(sc, sc);
      mat.map.needsUpdate = true;
      mat.needsUpdate = true;
    });
  });
  // también lastTexture ref
  if (currentModel.userData.lastTexture) {
    const t = currentModel.userData.lastTexture;
    t.offset.set(ox, oy);
    t.repeat.set(sc, sc);
    t.needsUpdate = true;
  }
}

function clearFaceFromModel() {
  if (!currentModel) return;
  if (faceBackupMaterials && faceBackupMaterials.length) {
    faceBackupMaterials.forEach((entry) => {
      const mats = Array.isArray(entry.mesh.material) ? entry.mesh.material : null;
      if (entry.isArray && mats) {
        if (mats[entry.index]) {
          mats[entry.index].map = entry.map;
          mats[entry.index].needsUpdate = true;
        }
      } else if (entry.mesh.material) {
        entry.mesh.material.map = entry.map;
        entry.mesh.material.needsUpdate = true;
      }
    });
  }
  faceBackupMaterials = null;
  currentModel.userData.activeFaceState = null;
}

function readEyeSlidersToState(fromNum) {
  const d = faceStateData[selectedFaceStateId];
  if (!d) return;
  if (fromNum) {
    d.eyeOffX = parseFloat(document.getElementById('eyeOffXNum').value) || 0;
    d.eyeOffY = parseFloat(document.getElementById('eyeOffYNum').value) || 0;
    d.eyeScale = parseFloat(document.getElementById('eyeScaleNum').value) || 1;
    document.getElementById('eyeOffX').value = d.eyeOffX;
    document.getElementById('eyeOffY').value = d.eyeOffY;
    document.getElementById('eyeScale').value = d.eyeScale;
  } else {
    d.eyeOffX = parseFloat(document.getElementById('eyeOffX').value) || 0;
    d.eyeOffY = parseFloat(document.getElementById('eyeOffY').value) || 0;
    d.eyeScale = parseFloat(document.getElementById('eyeScale').value) || 1;
    const nx = document.getElementById('eyeOffXNum');
    const ny = document.getElementById('eyeOffYNum');
    const ns = document.getElementById('eyeScaleNum');
    if (nx) nx.value = d.eyeOffX;
    if (ny) ny.value = d.eyeOffY;
    if (ns) ns.value = d.eyeScale;
  }
  // También sincronizar faceOff viejos si existen
  const fox = document.getElementById('faceOffX');
  const foy = document.getElementById('faceOffY');
  const fsc = document.getElementById('faceScale');
  if (fox) fox.value = d.eyeOffX;
  if (foy) foy.value = d.eyeOffY;
  if (fsc) fsc.value = d.eyeScale;

  if (currentModel) {
    // aplicar UV siempre que haya textura de cara activa o lastTexture
    if (currentModel.userData.activeFaceState || currentModel.userData.lastTexture) {
      applyEyeUVFromState(selectedFaceStateId);
    }
  }
}

function bindFaceButtons() {
  document.getElementById('btnFaceRotL')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.rotation = (d.rotation - 90 + 360) % 360;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceRotR')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.rotation = (d.rotation + 90) % 360;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceFlipH')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.flipH = !d.flipH;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnFaceFlipV')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d || !d.dataUrl) return;
    d.flipV = !d.flipV;
    updateFaceThumb(selectedFaceStateId);
  });
  document.getElementById('btnApplyFaceState')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const id = document.getElementById('faceStatePreview')?.value || selectedFaceStateId;
    selectedFaceStateId = id;
    applyFaceStateToModel(id);
  });
  document.getElementById('btnClearFaceState')?.addEventListener('click', () => {
    playSfx(sfxClick);
    clearFaceFromModel();
  });
  document.getElementById('faceStatePreview')?.addEventListener('change', (e) => {
    selectFaceState(e.target.value);
    // auto preview if has image
    if (faceStateData[e.target.value]?.dataUrl) {
      applyFaceStateToModel(e.target.value);
    }
  });
  ['eyeOffX', 'eyeOffY', 'eyeScale'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => readEyeSlidersToState(false));
  });
  ['eyeOffXNum', 'eyeOffYNum', 'eyeScaleNum'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => readEyeSlidersToState(true));
    document.getElementById(id)?.addEventListener('change', () => readEyeSlidersToState(true));
  });
  document.getElementById('btnResetEyes')?.addEventListener('click', () => {
    playSfx(sfxClick);
    const d = faceStateData[selectedFaceStateId];
    if (!d) return;
    d.eyeOffX = 0;
    d.eyeOffY = 0;
    d.eyeScale = 1;
    selectFaceState(selectedFaceStateId);
    if (currentModel && currentModel.userData.activeFaceState === selectedFaceStateId) {
      applyEyeUVFromState(selectedFaceStateId);
    }
  });

  document.getElementById('faceTargetMode')?.addEventListener('change', (e) => {
    const pick = e.target.value === 'pick';
    const ms = document.getElementById('faceMeshSelect');
    if (ms) ms.classList.toggle('hidden', !pick);
    if (pick) refreshFaceMeshSelect();
  });
  document.getElementById('btnRefreshMeshes')?.addEventListener('click', () => {
    playSfx(sfxClick);
    refreshFaceMeshSelect();
    document.getElementById('faceMeshSelect')?.classList.remove('hidden');
  });
}

buildFaceStatesUI();
bindFaceButtons();


(function syncMusicBtn() {
  const b = document.getElementById('btnMusic');
  if (b) b.textContent = musicOn ? 'Música: ON' : 'Música: OFF';
})();


// ===== HUD PNG uploads =====
const hudFiles = {
  powerMeter: null,
  lifeIcon: null,
  courseIcon: null,
  transition: null,
};

const HUD_RECOMMENDED = {
  hudPowerMeter: { w: 64, h: 64, key: 'powerMeter', prev: 'prevPowerMeter', size: 'sizePowerMeter', name: 'power_meter.png' },
  hudLifeIcon: { w: [32, 64], h: [32, 64], key: 'lifeIcon', prev: 'prevLifeIcon', size: 'sizeLifeIcon', name: 'life_icon.png' },
  hudCourseIcon: { w: 64, h: 64, key: 'courseIcon', prev: 'prevCourseIcon', size: 'sizeCourseIcon', name: 'course_icon.png' },
  hudTransition: { w: null, h: null, key: 'transition', prev: 'prevTransition', size: 'sizeTransition', name: 'transition.png' },
};

function bindHudUpload(inputId, meta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        hudFiles[meta.key] = { dataUrl, file, w, h, name: meta.name };
        const prev = document.getElementById(meta.prev);
        if (prev) {
          prev.textContent = '';
          prev.style.backgroundImage = 'url(' + dataUrl + ')';
        }
        const sizeEl = document.getElementById(meta.size);
        if (sizeEl) {
          sizeEl.textContent = w + '×' + h + ' px';
          sizeEl.className = 'hud-size';
          if (meta.w != null) {
            const okW = Array.isArray(meta.w) ? meta.w.includes(w) : w === meta.w;
            const okH = Array.isArray(meta.h) ? meta.h.includes(h) : h === meta.h;
            if (okW && okH) {
              sizeEl.textContent += ' ✓ tamaño recomendado';
            } else {
              sizeEl.className = 'hud-size warn';
              const rec = Array.isArray(meta.w)
                ? meta.w.map((x, i) => x + '×' + meta.h[i]).join(' o ')
                : meta.w + '×' + meta.h;
              sizeEl.textContent += ' (recomendado: ' + rec + ')';
            }
          }
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

Object.keys(HUD_RECOMMENDED).forEach((id) => bindHudUpload(id, HUD_RECOMMENDED[id]));
