const grid = document.querySelector("#worldPreviewGrid");
const dialog = document.querySelector("#worldViewerDialog");
const viewerMount = document.querySelector("#viewerMount");
const statusLine = document.querySelector("#statusLine");
const statusLogs = document.querySelector("#statusLogs");
const previewTitle = document.querySelector("#previewTitle");
const closePreview = document.querySelector("#closePreview");
const regenPreview = document.querySelector("#regenPreview");
const downloadBtn = document.querySelector("#downloadWorld");

async function fileFromUrl(url) {
  const res = await fetch(url, { cache: "force-cache", mode: "cors" });
  if (!res.ok) throw new Error(`Failed to fetch image ${url}`);
  const blob = await res.blob();
  const name = url.split("/").pop() || "scene.png";
  return new File([blob], name, { type: blob.type || "image/png" });
}

async function hashString(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

function logLine(message) {
  if (!message) return;
  statusLogs.textContent += `${message}\n`;
  statusLogs.scrollTop = statusLogs.scrollHeight;
}

async function mountViewer(worldFile) {
  viewerMount.replaceChildren();
  downloadBtn.href = worldFile?.url || "#";

  if (!worldFile?.url) {
    statusLine.textContent = "No world file returned.";
    return;
  }

  const url = worldFile.url;
  const type = (worldFile.content_type || "").toLowerCase();
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase();

  if (type.includes("model/gltf") || ["glb", "gltf"].includes(ext || "")) {
    await import("https://esm.run/@google/model-viewer@^4/dist/model-viewer.min.js");
    const el = document.createElement("model-viewer");
    el.setAttribute("src", url);
    el.setAttribute("camera-controls", "");
    el.setAttribute("touch-action", "pan-y");
    el.setAttribute("style", "width:100%;height:100%;display:block;background:#0b0b0b");
    el.setAttribute("alt", "Interactive 3D world preview");
    viewerMount.appendChild(el);
    statusLine.textContent = "3D model loaded. Drag to orbit.";
    return;
  }

  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "avif"].includes(ext || "")) {
    const THREE = await import("https://esm.run/three@0.160.0");
    const { OrbitControls } = await import(
      "https://esm.run/three@0.160.0/examples/jsm/controls/OrbitControls.js"
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewerMount.clientWidth, viewerMount.clientHeight);
    viewerMount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      viewerMount.clientWidth / viewerMount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0.1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;

    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const geometry = new THREE.SphereGeometry(50, 64, 64);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    function onResize() {
      const width = viewerMount.clientWidth;
      const height = viewerMount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    new ResizeObserver(onResize).observe(viewerMount);

    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();

    statusLine.textContent = "Panorama loaded. Drag to look around.";
    return;
  }

  const note = document.createElement("p");
  note.className = "text-subtle";
  note.textContent = "Preview not supported in-browser. Use Open / Download to view.";
  viewerMount.appendChild(note);
  statusLine.textContent = "File ready.";
}

async function generateWorld({ imageUrl, labels_fg1, labels_fg2, classes, force = false }) {
  const cacheKey = await hashString([imageUrl, labels_fg1, labels_fg2, classes].join("|"));
  const cacheHit = !force && sessionStorage.getItem(`world:${cacheKey}`);
  if (cacheHit) {
    return { data: JSON.parse(cacheHit), cached: true };
  }

  statusLine.textContent = "Submitting to Fal…";
  statusLogs.textContent = "";

  const response = await fetch("/api/world-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image_url: imageUrl, labels_fg1, labels_fg2, classes }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Server error: ${response.status}`);
  }

  const data = await response.json();

  try {
    sessionStorage.setItem(`world:${cacheKey}`, JSON.stringify({ world_file: data }));
  } catch (err) {
    console.warn("Failed to cache world preview", err);
  }

  return { data: { world_file: data }, cached: false };
}

function openDialogForFigure(figure) {
  const imageUrl = figure.dataset.worldImage || figure.dataset.image || figure.querySelector("img")?.src;
  const labels_fg1 = figure.dataset.labelsFg1 || "";
  const labels_fg2 = figure.dataset.labelsFg2 || "";
  const classes = figure.dataset.classes || "";
  const title = figure.querySelector("figcaption")?.textContent?.trim() || "Preview";

  previewTitle.textContent = title;
  viewerMount.replaceChildren();
  statusLine.textContent = "Preparing preview…";
  statusLogs.textContent = "";
  downloadBtn.href = "#";

  if (!dialog.open) {
    dialog.showModal();
  }

  generateWorld({ imageUrl, labels_fg1, labels_fg2, classes })
    .then(({ data }) => mountViewer(data.world_file))
    .catch((error) => {
      console.error(error);
      statusLine.textContent = "Error generating preview.";
      logLine(error?.message || String(error));
    });
}

grid?.addEventListener("click", (event) => {
  const figure = event.target.closest("figure.world-preview");
  if (figure) {
    openDialogForFigure(figure);
  }
});

grid?.querySelectorAll("figure.world-preview .figure__explore").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const figure = btn.closest("figure.world-preview");
    if (figure) {
      openDialogForFigure(figure);
    }
  });
});

closePreview?.addEventListener("click", () => dialog.close());

regenPreview?.addEventListener("click", () => {
  const title = previewTitle.textContent?.trim();
  const figure = [...document.querySelectorAll("figure.world-preview")].find(
    (fig) => fig.querySelector("figcaption")?.textContent?.trim() === title
  );
  if (!figure) return;

  const imageUrl = figure.dataset.image || figure.querySelector("img")?.src;
  const labels_fg1 = figure.dataset.labelsFg1 || "";
  const labels_fg2 = figure.dataset.labelsFg2 || "";
  const classes = figure.dataset.classes || "";

  statusLine.textContent = "Regenerating…";
  statusLogs.textContent = "";

  generateWorld({ imageUrl, labels_fg1, labels_fg2, classes, force: true })
    .then(({ data }) => mountViewer(data.world_file))
    .catch((error) => {
      console.error(error);
      statusLine.textContent = "Error generating preview.";
      logLine(error?.message || String(error));
    });
});

dialog?.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!inside) {
    dialog.close();
  }
});

