import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { chooseGraphQuality, createCompanyFocusedGraphLayout, createFocusedGraphLayout, createGraphLayout, getCompanyFocusedGraphNeighborhood, getFocusedGraphNeighborhood, getOverviewGraphNeighborhood, type CompanyFocusedGraphNeighborhood, type CompanyGraphBranch, type FocusedGraphNeighborhood } from "@/lib/industry-graph/layout";
import { getRelationEndpoints } from "@/lib/industry-graph/relations";
import type { IndustryGraphDisplaySettings, IndustryGraphEdge, IndustryGraphNode, IndustryGraphPayload, IndustryGraphSignalFilter } from "@/lib/industry-graph/types";
import { fillLinkPositions, segsFor } from "@/lib/vendor/galaxy-view/render/linkCurves";
import { NODE_FRAGMENT_SHADER, NODE_VERTEX_SHADER } from "@/lib/vendor/galaxy-view/render/shaders";
import { buildFieldStars, buildStarfield, disposeStarfield } from "@/lib/vendor/galaxy-view/render/starfield";
import { ClusterClouds, NebulaDome } from "@/lib/vendor/galaxy-view/render/nebula";

export type GalaxyInteractionState = {
  focusedCategoryId: number | null;
  focusedCompanyCode: string | null;
  expandedCompanyBranch: CompanyGraphBranch | null;
  selectedNodeId: string | null;
  highlightedPathNodeIds: string[];
  signalFilter: IndustryGraphSignalFilter;
  displaySettings: IndustryGraphDisplaySettings;
};

export type GalaxyRuntime = {
  setInteractionState: (state: GalaxyInteractionState) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  setAutoRotate: (enabled: boolean) => void;
  dispose: () => void;
};

type RenderEdge = { edge: IndustryGraphEdge; sourceIndex: number; targetIndex: number; color: THREE.Color };

export function mountGalaxyRenderer(host: HTMLDivElement, graph: IndustryGraphPayload, onSelect: (node: IndustryGraphNode) => void, onFailure: () => void): GalaxyRuntime {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000003);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 50_000);
  camera.position.set(0, 460, 390);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.domElement.dataset.testid = "industry-graph-canvas";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const quality = chooseGraphQuality({ hardwareConcurrency: navigator.hardwareConcurrency || 4, deviceMemory: memory, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  host.prepend(renderer.domElement);

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), quality.tier === "full" ? 0.26 : 0.18, 0.3, 0.28);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "atlas-label-layer";
  host.appendChild(labelRenderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 18;
  controls.maxDistance = 2_400;
  controls.autoRotate = quality.tier !== "reduced";
  controls.autoRotateSpeed = 0.16;

  const rawPositions = createGraphLayout(graph);
  const macroPositions = Object.fromEntries(
    graph.nodes.map((node) => {
      const [x, y, z] = rawPositions[node.id];
      const radialLift = node.kind === "category" ? Math.sin(node.layoutSeed * 0.000013) * 22 : Math.sin(node.layoutSeed * 0.000017) * 34;
      return [node.id, [x * 12, y * 12 + radialLift, z * 12] as [number, number, number]];
    }),
  );
  const nodes = graph.nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const overviewNeighborhood = getOverviewGraphNeighborhood(graph);
  const degreeByNode = new Map(nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) => {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);
  });
  const categories = nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category");
  const categoryById = new Map(categories.map((node) => [node.categoryId, node]));
  const relationCategories = buildRelationCategories(graph);
  const rootPalette = new Map(categories.filter((node) => node.parentId === null).map((node, index) => [node.categoryId, clusterColor(index)]));
  const rootForCategory = (categoryId: number) => {
    let category = categoryById.get(categoryId);
    while (category?.parentId !== null && category?.parentId !== undefined) category = categoryById.get(category.parentId);
    return category?.categoryId ?? categoryId;
  };
  const nodeColor = (node: IndustryGraphNode) => {
    if (node.kind === "evidence") {
      return new THREE.Color(node.credibility === "高" ? 0xffd77a : node.credibility === "中" ? 0xd6b86d : 0xa98c58);
    }
    const categoryId = node.kind === "category" ? node.categoryId : [...(relationCategories.get(node.id) ?? [])][0];
    return (categoryId === undefined ? new THREE.Color(0x91a8d5) : rootPalette.get(rootForCategory(categoryId)) ?? new THREE.Color(0x91a8d5)).clone();
  };

  const graphGroup = new THREE.Group();
  graphGroup.scale.setScalar(1);
  graphGroup.rotation.z = -0.04;
  scene.add(graphGroup);
  const resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const nodePositions = new Float32Array(nodes.length * 3);
  const nodeColors = new Float32Array(nodes.length * 3);
  const nodeSizes = new Float32Array(nodes.length);
  const nodeGhost = new Float32Array(nodes.length);
  const nodeDim = new Float32Array(nodes.length).fill(1);
  nodes.forEach((node, index) => {
    const position = macroPositions[node.id];
    nodePositions.set(position, index * 3);
    nodeColor(node).toArray(nodeColors, index * 3);
    const degree = degreeByNode.get(node.id) ?? 0;
    nodeSizes[index] = node.kind === "evidence" ? 2.15 : Math.min(2.2 * (1 + 0.5 * Math.sqrt(degree)), 13.2);
    nodeGhost[index] = (node.kind === "company" && node.evidenceCount === 0) || (node.kind === "evidence" && node.credibility === "低") ? 1 : 0;
  });
  const baseNodeColors = nodeColors.slice();
  const baseNodeSizes = nodeSizes.slice();
  const targetNodePositions = nodePositions.slice();
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute("color", new THREE.BufferAttribute(nodeColors, 3));
  nodeGeometry.setAttribute("aSize", new THREE.BufferAttribute(nodeSizes, 1));
  nodeGeometry.setAttribute("aGhost", new THREE.BufferAttribute(nodeGhost, 1));
  nodeGeometry.setAttribute("aDim", new THREE.BufferAttribute(nodeDim, 1));
  const nodeMaterial = new THREE.ShaderMaterial({
    vertexShader: NODE_VERTEX_SHADER,
    fragmentShader: NODE_FRAGMENT_SHADER,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPixelScale: { value: 1 },
      uSizeMul: { value: 0.9 },
      uLightMode: { value: 0 },
      uMaxPoint: { value: 110 * renderer.getPixelRatio() },
    },
  });
  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
  nodePoints.renderOrder = 2;
  nodePoints.frustumCulled = false;
  graphGroup.add(nodePoints);
  resources.push(nodeGeometry, nodeMaterial);
  const focusHaloTexture = createFocusHaloTexture();
  const focusHaloMaterial = new THREE.SpriteMaterial({ map: focusHaloTexture, color: 0xf0c967, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const focusHalo = new THREE.Sprite(focusHaloMaterial);
  focusHalo.scale.set(46, 46, 1);
  focusHalo.visible = false;
  focusHalo.renderOrder = 1;
  graphGroup.add(focusHalo);
  resources.push(focusHaloTexture, focusHaloMaterial);
  const focusOrbits = buildFocusOrbits(resources);
  focusOrbits.visible = false;
  graphGroup.add(focusOrbits);

  const derivedPeerEdges = buildDerivedPeerEdges(graph);
  const renderEdges = [...graph.edges, ...derivedPeerEdges].flatMap((edge) => {
    const sourceIndex = nodeIndex.get(edge.source);
    const targetIndex = nodeIndex.get(edge.target);
    if (sourceIndex === undefined || targetIndex === undefined) return [];
    const blendedColor = nodeColor(nodes[sourceIndex]!).lerp(nodeColor(nodes[targetIndex]!), 0.5);
    blendedColor.offsetHSL(0, -0.28, -0.2);
    const color = edgeSemanticColor(edge, blendedColor);
    if (edge.kind !== "hierarchy") color.multiplyScalar(0.7 + ((edge.strength ?? 50) / 100) * 0.5);
    return [{ edge, sourceIndex, targetIndex, color }];
  });
  const renderEdgePairs = renderEdges.map((item) => ({ source: item.sourceIndex, target: item.targetIndex }));
  const renderEdgeById = new Map(renderEdges.map((item, index) => [item.edge.id, { item, index }]));
  const linkK = segsFor(0.31, quality.tier === "full" ? 5 : 3);
  const linkGeometry = new THREE.BufferGeometry();
  const linkPositions = new Float32Array(renderEdges.length * linkK * 6);
  const linkColors = new Float32Array(renderEdges.length * linkK * 6);
  const linkProgress = new Float32Array(renderEdges.length * linkK * 2);
  const linkPhases = new Float32Array(renderEdges.length * linkK * 2);
  const linkPatterns = new Float32Array(renderEdges.length * linkK * 2);
  fillLinkPositions(linkPositions, nodePositions, renderEdgePairs, linkK, 0.31);
  renderEdges.forEach((item, edgeIndex) => {
    writeLinkColor(linkColors, edgeIndex, linkK, item.color);
    const phase = (edgeIndex * 0.61803398875) % 1;
    for (let segment = 0; segment < linkK; segment += 1) {
      const offset = edgeIndex * linkK * 2 + segment * 2;
      linkProgress[offset] = segment / linkK;
      linkProgress[offset + 1] = (segment + 1) / linkK;
      linkPhases[offset] = phase;
      linkPhases[offset + 1] = phase;
      linkPatterns[offset] = edgePattern(item.edge);
      linkPatterns[offset + 1] = edgePattern(item.edge);
    }
  });
  linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
  linkGeometry.setAttribute("color", new THREE.BufferAttribute(linkColors, 3));
  linkGeometry.setAttribute("aProgress", new THREE.BufferAttribute(linkProgress, 1));
  linkGeometry.setAttribute("aPhase", new THREE.BufferAttribute(linkPhases, 1));
  linkGeometry.setAttribute("aPattern", new THREE.BufferAttribute(linkPatterns, 1));
  const linkMaterial = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aProgress;
      attribute float aPhase;
      attribute float aPattern;
      varying vec3 vColor;
      varying float vProgress;
      varying float vPhase;
      varying float vPattern;
      void main() {
        vColor = color;
        vProgress = aProgress;
        vPhase = aPhase;
        vPattern = aPattern;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vColor;
      varying float vProgress;
      varying float vPhase;
      varying float vPattern;
      void main() {
        float wave = 0.72 + 0.28 * sin((vProgress + vPhase + uTime * 0.028) * 6.2831853);
        float cursor = fract(vProgress - uTime * 0.115 + vPhase);
        float head = smoothstep(0.13, 0.0, abs(cursor - 0.5));
        float wake = smoothstep(0.34, 0.0, abs(cursor - 0.38)) * 0.28;
        float baseAlpha = 0.12 + head * 0.72 + wake;
        float dotted = step(0.5, fract(vProgress * 13.0 + vPhase));
        float dashed = step(0.34, fract(vProgress * 7.0 + vPhase));
        float patternAlpha = vPattern < 0.5 ? 1.0 : (vPattern < 1.5 ? dotted : dashed);
        float alpha = baseAlpha * mix(0.18, 1.0, patternAlpha);
        gl_FragColor = vec4(vColor * (wave + head * 1.35), alpha);
      }
    `,
  });
  const links = new THREE.LineSegments(linkGeometry, linkMaterial);
  links.renderOrder = 1;
  links.frustumCulled = false;
  graphGroup.add(links);
  resources.push(linkGeometry, linkMaterial);

  const pulseCountPerEdge = quality.tier === "reduced" ? 0 : quality.tier === "full" ? 2 : 1;
  const pulsePositions = new Float32Array(renderEdges.length * pulseCountPerEdge * 3);
  const pulseColors = new Float32Array(renderEdges.length * pulseCountPerEdge * 3);
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
  pulseGeometry.setAttribute("color", new THREE.BufferAttribute(pulseColors, 3));
  const pulseTexture = createPulseTexture();
  const pulseMaterial = new THREE.PointsMaterial({ map: pulseTexture, size: 0.46, sizeAttenuation: true, transparent: true, opacity: 0.62, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pulseHaloMaterial = new THREE.PointsMaterial({ map: pulseTexture, size: 0.84, sizeAttenuation: true, transparent: true, opacity: 0.055, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pulsePoints = new THREE.Points(pulseGeometry, pulseMaterial);
  const pulseHalos = new THREE.Points(pulseGeometry, pulseHaloMaterial);
  pulsePoints.frustumCulled = false;
  pulseHalos.frustumCulled = false;
  pulsePoints.renderOrder = 3;
  pulseHalos.renderOrder = 2;
  graphGroup.add(pulseHalos, pulsePoints);
  resources.push(pulseGeometry, pulseTexture, pulseMaterial, pulseHaloMaterial);
  let activePulseEdgeIndexes: number[] = [];

  const labels = new Map<string, HTMLElement>();
  const labelObjects = new Map<string, CSS2DObject>();
  const createNodeLabel = (node: IndustryGraphNode) => {
    const element = document.createElement("span");
    element.className = `atlas-node-label is-quiet ${node.kind === "category" ? "is-category" : node.kind === "entity" ? `is-entity${node.profileRole ? ` is-profile-${node.profileRole} is-branch-${node.profileBranch}` : ""}` : node.kind === "evidence" ? "is-evidence" : "is-company"}`;
    const name = document.createElement("b");
    name.textContent = node.label;
    element.appendChild(name);
    if (node.kind === "company") {
      const code = document.createElement("small");
      code.textContent = node.stockCode;
      element.appendChild(code);
    } else if (node.kind === "evidence") {
      const source = document.createElement("small");
      source.textContent = [node.sourceType, node.sourceDate].filter(Boolean).join(" · ");
      element.appendChild(source);
    }
    const label = new CSS2DObject(element);
    const index = nodeIndex.get(node.id) ?? 0;
    label.position.set(nodePositions[index * 3], nodePositions[index * 3 + 1], nodePositions[index * 3 + 2]);
    label.position.y += node.kind === "category" ? 2.2 : 1.4;
    graphGroup.add(label);
    labels.set(node.id, element);
    labelObjects.set(node.id, label);
  };
  const syncNodeLabels = (nodeIds: Set<string>) => {
    labelObjects.forEach((label, nodeId) => {
      if (nodeIds.has(nodeId)) return;
      graphGroup.remove(label);
      labels.get(nodeId)?.remove();
      labels.delete(nodeId);
      labelObjects.delete(nodeId);
    });
    nodeIds.forEach((nodeId) => {
      if (labelObjects.has(nodeId)) return;
      const node = nodeById.get(nodeId);
      if (node) createNodeLabel(node);
    });
  };

  const edgeLabelElements = new Map<string, HTMLElement>();
  const edgeLabelObjects = new Map<string, CSS2DObject>();
  const syncEdgeLabels = (edgeIds: Set<string>) => {
    edgeLabelObjects.forEach((label, edgeId) => {
      if (edgeIds.has(edgeId)) return;
      graphGroup.remove(label);
      edgeLabelElements.get(edgeId)?.remove();
      edgeLabelElements.delete(edgeId);
      edgeLabelObjects.delete(edgeId);
    });
    edgeIds.forEach((edgeId) => {
      if (edgeLabelObjects.has(edgeId)) return;
      const row = renderEdgeById.get(edgeId);
      if (!row || row.item.edge.kind === "hierarchy" || row.item.edge.kind === "evidenceLink") return;
      const semantic = edgeSemantic(row.item.edge);
      const element = document.createElement("span");
      element.className = `atlas-edge-label is-${semantic.kind} is-visible`;
      element.textContent = semantic.label;
      element.setAttribute("aria-hidden", "true");
      const label = new CSS2DObject(element);
      graphGroup.add(label);
      edgeLabelElements.set(edgeId, element);
      edgeLabelObjects.set(edgeId, label);
    });
  };
  const updateEdgeLabelPositions = () => {
    const visibleRowsBySemantic = new Map<EdgeSemanticKind, string[]>();
    edgeLabelObjects.forEach((_label, edgeId) => {
      const row = renderEdgeById.get(edgeId);
      if (!row) return;
      const kind = edgeSemantic(row.item.edge).kind;
      const rows = visibleRowsBySemantic.get(kind) ?? [];
      rows.push(edgeId);
      visibleRowsBySemantic.set(kind, rows);
    });
    edgeLabelObjects.forEach((label, edgeId) => {
      const row = renderEdgeById.get(edgeId);
      if (!row) return;
      const { item, index } = row;
      const { edge, sourceIndex, targetIndex } = item;
      const semantic = edgeSemantic(edge);
      const semanticRows = visibleRowsBySemantic.get(semantic.kind) ?? [];
      const laneIndex = Math.max(0, semanticRows.indexOf(edgeId));
      const laneCount = Math.max(semanticRows.length, 1);
      const progress = laneCount === 1
        ? semantic.kind === "peer" ? 0.58 : semantic.kind === "category" ? 0.47 : 0.54
        : 0.38 + (laneIndex / (laneCount - 1)) * 0.28;
      const sourceOffset = sourceIndex * 3;
      const targetOffset = targetIndex * 3;
      const laneOffset = (laneIndex - (laneCount - 1) / 2) * 0.44;
      label.position.set(
        THREE.MathUtils.lerp(nodePositions[sourceOffset] ?? 0, nodePositions[targetOffset] ?? 0, progress) + laneOffset,
        THREE.MathUtils.lerp(nodePositions[sourceOffset + 1] ?? 0, nodePositions[targetOffset + 1] ?? 0, progress) + 1.3 + (index % 2) * 0.42,
        THREE.MathUtils.lerp(nodePositions[sourceOffset + 2] ?? 0, nodePositions[targetOffset + 2] ?? 0, progress),
      );
    });
  };

  const starScale = quality.tier === "full" ? 0.18 : quality.tier === "balanced" ? 0.12 : 0.08;
  const stars = buildStarfield(graphRadius(nodePositions) * 6.5, starScale);
  scene.add(stars.group);
  const fieldStars = buildFieldStars(graphRadius(nodePositions) * 2.2, quality.tier === "full" ? 0.04 : 0.02, starScale);
  scene.add(fieldStars);
  const graphDust = buildGraphDust(graphRadius(nodePositions), quality.tier);
  graphGroup.add(graphDust.points);
  resources.push(graphDust.geometry, graphDust.material);
  const nebula = new NebulaDome(graphRadius(nodePositions) * 2.25);
  nebula.setQuality(starScale);
  nebula.bake("#102c61", "#0c8398");
  nebula.setIntensity(quality.tier === "full" ? 0.08 : 0.04);
  scene.add(nebula.object);
  const clusterClouds = new ClusterClouds();
  clusterClouds.rebuild({ nodes: nodes.map((node) => ({ degree: overviewNeighborhood.visibleNodeIds.has(node.id) ? degreeByNode.get(node.id) ?? 0 : 0 })) }, nodePositions, graphRadius(nodePositions));
  clusterClouds.recolor((index) => new THREE.Color().fromArray(nodeColors, index * 3));
  clusterClouds.setIntensity(quality.tier === "full" ? 0.12 : 0.06);
  scene.add(clusterClouds.points);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 5;
  const pointer = new THREE.Vector2();
  let hoveredId: string | null = null;
  let interaction: GalaxyInteractionState = {
    focusedCategoryId: null,
    focusedCompanyCode: null,
    expandedCompanyBranch: null,
    selectedNodeId: null,
    highlightedPathNodeIds: [],
    signalFilter: "all",
    displaySettings: { showCompanies: true, showCategories: true, showLinks: true, showEvidenceHeat: true },
  };
  let animationFrame = 0;
  let renderFrame = 0;
  let lastRenderedAt = 0;
  let visible = !document.hidden;
  let intersecting = true;
  let reveal = false;
  let cameraFollowing = true;
  let pointerOrigin: { x: number; y: number } | null = null;
  let targetCamera = camera.position.clone();
  let targetControl = controls.target.clone();
  let layoutSettling = false;
  let activeLayoutNodeIndexes: number[] = [];
  const activeRenderEdgePairs: Array<{ source: number; target: number } | undefined> = renderEdgePairs.map(() => undefined);
  let localVisibleRadius = 48;
  let targetGroupRotationZ = graphGroup.rotation.z;
  const clock = new THREE.Clock();
  let elapsed = 0;
  const radius = graphRadiusForNodeIds(nodePositions, nodeIndex, overviewNeighborhood.visibleNodeIds);
  const overviewDistance = Math.max(520, radius * 2.05);
  const overviewPosition = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(50)) * overviewDistance, Math.cos(THREE.MathUtils.degToRad(50)) * overviewDistance);
  camera.position.copy(overviewPosition);
  targetCamera.copy(overviewPosition);

  let focusedNeighborhood: FocusedGraphNeighborhood | CompanyFocusedGraphNeighborhood | null = null;
  let boundaryCategoryIds = new Set<number>();
  const updateFocusedNeighborhood = () => {
    if (interaction.focusedCompanyCode !== null) {
      focusedNeighborhood = getCompanyFocusedGraphNeighborhood(graph, interaction.focusedCompanyCode, interaction.expandedCompanyBranch);
      boundaryCategoryIds = new Set();
      return;
    }
    const focusId = interaction.focusedCategoryId;
    if (focusId === null) {
      focusedNeighborhood = null;
      boundaryCategoryIds = new Set();
      return;
    }
    focusedNeighborhood = getFocusedGraphNeighborhood(graph, focusId);
    boundaryCategoryIds = focusedNeighborhood.contextCategoryIds;
  };
  const matchesSignal = (edge: IndustryGraphEdge) => {
    if (edge.kind === "hierarchy" || interaction.signalFilter === "all") return true;
    if (edge.kind === "evidenceLink" && (interaction.signalFilter === "upstream" || interaction.signalFilter === "downstream")) return false;
    if (interaction.signalFilter === "upstream") return edge.direction === "inbound" || edge.direction === "bidirectional";
    if (interaction.signalFilter === "downstream") return edge.direction === "outbound" || edge.direction === "bidirectional";
    if (edge.kind === "evidenceLink") return false;
    if (interaction.signalFilter === "verified") return edge.verificationStatus === "verified";
    if (interaction.signalFilter === "review") return edge.verificationStatus !== "verified";
    if (interaction.signalFilter === "missingEvidence") return edge.evidenceCount === 0;
    return Boolean(edge.isWatchlist);
  };
  const nodeVisible = (node: IndustryGraphNode) => {
    return focusedNeighborhood === null
      ? overviewNeighborhood.visibleNodeIds.has(node.id)
      : focusedNeighborhood.visibleNodeIds.has(node.id);
  };
  const edgeVisible = (edge: IndustryGraphEdge) => {
    if (edge.id.startsWith("derived-peer:")) {
      const focusCompanyNodeId = interaction.focusedCompanyCode ? `company:${interaction.focusedCompanyCode}` : null;
      return Boolean(focusCompanyNodeId && edge.source === focusCompanyNodeId && focusedNeighborhood?.visibleNodeIds.has(edge.target));
    }
    return focusedNeighborhood === null
      ? overviewNeighborhood.visibleEdgeIds.has(edge.id)
      : focusedNeighborhood.visibleEdgeIds.has(edge.id);
  };
  const nodeRenderable = (node: IndustryGraphNode) => {
    const overview = interaction.focusedCategoryId === null && interaction.focusedCompanyCode === null;
    if (overview) {
      // The overview exposes two taxonomy tiers plus a small representative
      // company orbit for root classifications that do not have child categories.
      // This completes every top-level cluster without drawing all 5,522 stocks.
      return node.kind === "category"
        ? interaction.displaySettings.showCategories
        : node.kind === "company"
          ? interaction.displaySettings.showCompanies
          : false;
    }
    return node.kind === "company"
      ? interaction.displaySettings.showCompanies
      : node.kind === "category"
        ? interaction.displaySettings.showCategories
        : node.kind === "evidence"
          ? interaction.displaySettings.showEvidenceHeat
          : interaction.displaySettings.showCompanies;
  };
  const edgeRenderable = (edge: IndustryGraphEdge) => {
    if (!interaction.displaySettings.showLinks || !edgeVisible(edge) || !matchesSignal(edge)) return false;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    return Boolean(
      source
      && target
      && nodeVisible(source)
      && nodeVisible(target)
      && nodeRenderable(source)
      && nodeRenderable(target)
    );
  };
  const updateLayoutTarget = () => {
    updateFocusedNeighborhood();
    const focusId = interaction.focusedCategoryId;
    const companyCode = interaction.focusedCompanyCode;
    const localFocus = focusId !== null || companyCode !== null;
    const localPositions = companyCode !== null
      ? createCompanyFocusedGraphLayout(graph, companyCode, interaction.expandedCompanyBranch)
      : focusId === null ? null : createFocusedGraphLayout(graph, focusId);
    localVisibleRadius = 18;
    activeLayoutNodeIndexes = [];
    nodes.forEach((node, index) => {
      const raw = localPositions?.[node.id] ?? rawPositions[node.id];
      const scale = localFocus ? 4.4 : 12;
      const radialLift = localFocus ? 0 : (node.kind === "category" ? Math.sin(node.layoutSeed * 0.000013) * 22 : Math.sin(node.layoutSeed * 0.000017) * 34);
      targetNodePositions[index * 3] = raw[0] * scale;
      targetNodePositions[index * 3 + 1] = raw[1] * scale + radialLift;
      targetNodePositions[index * 3 + 2] = raw[2] * scale;
      if (nodeVisible(node) && nodeRenderable(node)) {
        activeLayoutNodeIndexes.push(index);
        if (localFocus) localVisibleRadius = Math.max(localVisibleRadius, Math.hypot(raw[0] * scale, raw[1] * scale, raw[2] * scale));
      } else {
        nodePositions[index * 3] = targetNodePositions[index * 3];
        nodePositions[index * 3 + 1] = targetNodePositions[index * 3 + 1];
        nodePositions[index * 3 + 2] = targetNodePositions[index * 3 + 2];
      }
    });
    fillLinkPositions(linkPositions, nodePositions, activeRenderEdgePairs, linkK, localFocus ? 0.38 : 0.31);
    (nodeGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (linkGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    targetGroupRotationZ = localFocus ? 0 : -0.04;
    host.classList.toggle("is-local-focus", localFocus);
    host.classList.toggle("is-company-focus", companyCode !== null);
    focusHalo.visible = localFocus;
    focusOrbits.visible = localFocus;
    focusHalo.scale.setScalar(companyCode !== null ? 104 : 62);
    clusterClouds.setIntensity(localFocus ? 0.018 : (quality.tier === "full" ? 0.12 : 0.06));
    nebula.setIntensity(localFocus ? 0.022 : (quality.tier === "full" ? 0.08 : 0.04));
    layoutSettling = true;
  };
  const setCameraTarget = () => {
    if (interaction.focusedCategoryId === null && interaction.focusedCompanyCode === null) {
      targetCamera = overviewPosition.clone();
      targetControl = new THREE.Vector3();
      controls.autoRotate = quality.tier !== "reduced";
      cameraFollowing = true;
      return;
    }
    const distance = interaction.focusedCompanyCode !== null
      ? Math.max(108, Math.min(194, localVisibleRadius * 1.28 + 30))
      : Math.max(138, Math.min(260, localVisibleRadius * 1.82 + 52));
    targetCamera = new THREE.Vector3(0, 0, distance);
    targetControl = interaction.focusedCompanyCode !== null
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(0, 0, 0);
    controls.autoRotate = false;
    cameraFollowing = true;
  };
  // Active relationships are emphasized in the curved link shader itself.
  // Drawing a second LineSegments overlay would create a straight chord and
  // visually flatten the spherical orbit.
  // Hovering changes visual emphasis only. Reframing is reserved for a deliberate
  // selection/focus change so an analyst's manual camera position is never overwritten.
  const applyState = (shouldReframe = false) => {
    updateFocusedNeighborhood();
    const localFocus = interaction.focusedCategoryId !== null || interaction.focusedCompanyCode !== null;
    if (fieldStars.material.sizeAttenuation === localFocus) {
      fieldStars.material.sizeAttenuation = !localFocus;
      fieldStars.material.needsUpdate = true;
    }
    if (graphDust.material.sizeAttenuation === localFocus) {
      graphDust.material.sizeAttenuation = !localFocus;
      graphDust.material.needsUpdate = true;
    }
    const path = new Set(interaction.highlightedPathNodeIds);
    const visibleEndpointIds = new Set<string>();
    if (localFocus) {
      renderEdges.forEach(({ edge }) => {
        if (!edgeRenderable(edge)) return;
        visibleEndpointIds.add(edge.source);
        visibleEndpointIds.add(edge.target);
      });
    }
    const desiredNodeLabelIds = new Set(
      nodes
        .filter((node) => localFocus
          ? nodeVisible(node) && nodeRenderable(node)
          : node.kind === "category" && node.level <= 1 && nodeRenderable(node))
        .map((node) => node.id),
    );
    syncNodeLabels(desiredNodeLabelIds);
    nodes.forEach((node, index) => {
      const focused = nodeVisible(node);
      const renderable = nodeRenderable(node);
      const active = node.id === interaction.selectedNodeId || node.id === hoveredId || path.has(node.id);
      nodeDim[index] = !renderable ? 0.001 : active ? 1 : focused ? 0.86 : 0.065;
      const companyContextCategory = interaction.focusedCompanyCode !== null
        && node.kind === "category"
        && focusedNeighborhood !== null
        && "contextCategoryIds" in focusedNeighborhood
        && focusedNeighborhood.contextCategoryIds.has(node.categoryId);
      const companyDirectCategory = interaction.focusedCompanyCode !== null
        && node.kind === "category"
        && focusedNeighborhood !== null
        && "categoryIds" in focusedNeighborhood
        && focusedNeighborhood.categoryIds.has(node.categoryId);
      const boundaryCategory = node.kind === "category" && (
        (interaction.focusedCategoryId !== null && boundaryCategoryIds.has(node.categoryId))
        || companyContextCategory
      );
      const showCategory = interaction.focusedCategoryId !== null && node.kind === "category" && focused;
      const isCompanyFocus = interaction.focusedCompanyCode !== null && node.id === `company:${interaction.focusedCompanyCode}`;
      const directCompany = isCompanyFocus || (interaction.focusedCategoryId !== null && node.kind === "company" && relationCategories.get(node.id)?.has(interaction.focusedCategoryId));
      const showFocusedCompany = localFocus && node.kind === "company" && focused;
      const connectedEndpoint = visibleEndpointIds.has(node.id);
      const overviewLabel = !localFocus && node.kind === "category" && node.level <= 1;
      const label = labels.get(node.id);
      label?.classList.toggle("is-quiet", !renderable || !(active || overviewLabel || showCategory || showFocusedCompany || connectedEndpoint));
      label?.classList.toggle("is-active", active);
      label?.classList.toggle("is-muted", !focused);
      label?.classList.toggle("is-local", localFocus && focused);
      label?.classList.toggle("is-local-focus", (interaction.focusedCategoryId !== null && node.kind === "category" && node.categoryId === interaction.focusedCategoryId) || isCompanyFocus);
      label?.classList.toggle("is-boundary", boundaryCategory);
      label?.classList.toggle("is-local-company", localFocus && node.kind === "company" && focused);
      label?.classList.toggle("is-local-direct", Boolean(directCompany));
      label?.classList.toggle("is-edge-endpoint", localFocus && connectedEndpoint);
      const color = new THREE.Color().fromArray(baseNodeColors, index * 3);
      if (localFocus && focused) {
        if (isCompanyFocus || (node.kind === "category" && node.categoryId === interaction.focusedCategoryId)) color.set(0xf0c967);
        else if (companyDirectCategory) color.set(0x65d8d6);
        else if (companyContextCategory) color.set(0x7695c9);
        else if (node.kind === "company") {
          if (interaction.focusedCompanyCode !== null) color.set(directCompany ? 0xf0c967 : 0x82aef2);
          else color.copy(nodeColor(node)).lerp(new THREE.Color(directCompany ? 0xbfdcff : 0x93aeda), 0.22);
          if (interaction.displaySettings.showEvidenceHeat && node.evidenceCount > 0) {
            color.lerp(new THREE.Color(0x80e7c3), Math.min(0.18, node.evidenceCount * 0.04));
          }
        } else if (node.kind === "entity" && node.profileRole) {
          color.set(node.profileBranch === "upstream" ? 0x68d8c4
            : node.profileBranch === "downstream" ? 0x72aef4
              : node.profileBranch === "peer" ? 0xb68be7
                : node.profileBranch === "organization" ? 0x83d9b9
                  : 0xf0c967);
        } else if (node.kind === "evidence") {
          color.set(node.credibility === "高" ? 0xffd77a : node.credibility === "中" ? 0xd6b86d : 0xa98c58);
        } else color.lerp(new THREE.Color(0xdbe8ff), 0.08);
      }
      color.toArray(nodeColors, index * 3);
      nodeSizes[index] = !renderable ? 0.01 : !localFocus
        ? baseNodeSizes[index]
        : !focused
          ? 0.45
          : isCompanyFocus
            ? 20.5
            : node.kind === "category" && node.categoryId === interaction.focusedCategoryId
              ? 13.8
            : node.kind === "category"
              ? companyContextCategory ? 5.6 : 10.2
              : node.kind === "evidence"
                ? 2.5
                : node.kind === "entity" && node.profileRole === "hub"
                  ? 11.2
                  : node.kind === "entity" && node.profileRole === "member"
                    ? 3.7
                : directCompany
                  ? 5.8
                  : 4.8;
    });
    // Local nodes can pass close to the camera in the spherical layout. Capping
    // their screen size preserves depth without turning the foreground into discs.
    nodeMaterial.uniforms.uMaxPoint.value = (interaction.focusedCompanyCode !== null ? 118 : localFocus ? 82 : 110) * renderer.getPixelRatio();
    // Keep a restrained travelling signal visible as soon as a local orbit opens.
    // Its positions are derived from the same curve buffer as the line, avoiding
    // the visual drift caused by an independent particle path.
    pulseMaterial.size = localFocus ? 0.25 : 0.46;
    pulseHaloMaterial.size = localFocus ? 0.48 : 0.84;
    pulseMaterial.opacity = localFocus ? 0.68 : 0.62;
    pulseHaloMaterial.opacity = localFocus ? 0.045 : 0.055;
    (nodeGeometry.getAttribute("aDim") as THREE.BufferAttribute).needsUpdate = true;
    (nodeGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (nodeGeometry.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    const focusCompanyNodeId = interaction.focusedCompanyCode ? `company:${interaction.focusedCompanyCode}` : null;
    const labelLimits: Record<EdgeSemanticKind, number> = {
      upstream: 3,
      downstream: 3,
      core: 3,
      organization: 2,
      peer: 4,
      category: 2,
      neutral: 0,
    };
    const chosenLabelIds = new Set<string>();
    if (focusCompanyNodeId) {
      const candidatesBySemantic = new Map<EdgeSemanticKind, RenderEdge[]>();
      renderEdges.forEach((item) => {
        if (!edgeRenderable(item.edge)) return;
        const directlyRelated = item.edge.source === focusCompanyNodeId
          || item.edge.target === focusCompanyNodeId
          || item.edge.id.startsWith("derived-peer:");
        if (!directlyRelated) return;
        const kind = edgeSemantic(item.edge).kind;
        const rows = candidatesBySemantic.get(kind) ?? [];
        rows.push(item);
        candidatesBySemantic.set(kind, rows);
      });
      candidatesBySemantic.forEach((rows, kind) => {
        rows
          .sort((left, right) => {
            const leftActive = path.size > 1 && path.has(left.edge.source) && path.has(left.edge.target) ? 1 : 0;
            const rightActive = path.size > 1 && path.has(right.edge.source) && path.has(right.edge.target) ? 1 : 0;
            return rightActive - leftActive
              || edgeStrength(right.edge) - edgeStrength(left.edge)
              || right.edge.evidenceCount - left.edge.evidenceCount
              || left.edge.id.localeCompare(right.edge.id);
          })
          .slice(0, labelLimits[kind])
          .forEach((item) => chosenLabelIds.add(item.edge.id));
      });
    }
    syncEdgeLabels(chosenLabelIds);
    activePulseEdgeIndexes = [];
    activeRenderEdgePairs.fill(undefined);
    renderEdges.forEach((item, index) => {
      const activeEdge = path.size > 1 && path.has(item.edge.source) && path.has(item.edge.target);
      const visibleEdge = edgeRenderable(item.edge);
      const relationEndpoints = item.edge.kind === "relation" ? getRelationEndpoints(item.edge) : null;
      const touchesFocus = (interaction.focusedCategoryId !== null && relationEndpoints?.categoryId === interaction.focusedCategoryId)
        || (interaction.focusedCompanyCode !== null && (item.edge.source === `company:${interaction.focusedCompanyCode}` || item.edge.target === `company:${interaction.focusedCompanyCode}`));
      const signalGold = new THREE.Color(0xe9d89d);
      const semanticColor = edgeSemanticColor(item.edge, item.color);
      const color = !visibleEdge
        ? new THREE.Color(0x000000)
        : activeEdge
          ? semanticColor.clone().lerp(new THREE.Color(0xffffff), 0.34)
          : localFocus
            ? semanticColor.clone().multiplyScalar(touchesFocus ? 1.06 : 0.86)
            : touchesFocus
              ? signalGold.clone().multiplyScalar(0.92)
              : item.color.clone().multiplyScalar(0.8);
      writeLinkColor(linkColors, index, linkK, color);
      writePulseColor(pulseColors, index, pulseCountPerEdge, color);
      if (visibleEdge) {
        activePulseEdgeIndexes.push(index);
        activeRenderEdgePairs[index] = renderEdgePairs[index];
      }
      const edgeLabel = edgeLabelElements.get(item.edge.id);
      if (edgeLabel) {
        edgeLabel.classList.toggle("is-emphasized", activeEdge);
      }
    });
    pulsePoints.visible = localFocus && interaction.displaySettings.showLinks && pulseCountPerEdge > 0 && activePulseEdgeIndexes.length > 0;
    pulseHalos.visible = pulsePoints.visible;
    updateEdgeLabelPositions();
    (linkGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (pulseGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    if (shouldReframe) {
      updateLayoutTarget();
      setCameraTarget();
    }
  };

  const hoverCard = document.createElement("div");
  hoverCard.className = "atlas-hover-card";
  hoverCard.setAttribute("role", "status");
  host.appendChild(hoverCard);
  const hideHoverCard = () => hoverCard.classList.remove("is-visible");
  const showHoverCard = (node: IndustryGraphNode, event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left + 16, 12), rect.width - 220);
    const y = Math.min(Math.max(event.clientY - rect.top + 16, 12), rect.height - 104);
    hoverCard.replaceChildren(createHoverTitle(node), createHoverMeta(node), createHoverDescription(node));
    hoverCard.style.transform = `translate(${x}px, ${y}px)`;
    hoverCard.classList.add("is-visible");
  };
  const releaseCamera = () => {
    cameraFollowing = false;
    controls.autoRotate = false;
    targetCamera.copy(camera.position);
    targetControl.copy(controls.target);
  };
  const pointerMove = (event: PointerEvent) => {
    if (pointerOrigin && Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) > 4) releaseCamera();
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(nodePoints, false).find((row) => row.index !== undefined && nodeVisible(nodes[row.index]!) && nodeRenderable(nodes[row.index]!));
    const nextHoveredId = hit?.index === undefined ? null : nodes[hit.index]?.id ?? null;
    if (nextHoveredId === hoveredId) {
      const sameNode = nextHoveredId ? nodeById.get(nextHoveredId) : null;
      if (sameNode) showHoverCard(sameNode, event);
      return;
    }
    hoveredId = nextHoveredId;
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    const hoveredNode = hoveredId ? nodeById.get(hoveredId) : null;
    if (hoveredNode) showHoverCard(hoveredNode, event);
    else hideHoverCard();
    applyState();
  };
  const click = () => { if (hoveredId) { const node = nodeById.get(hoveredId); if (node) onSelect(node); } };
  const wheel = () => releaseCamera();
  const contextLost = (event: Event) => { event.preventDefault(); onFailure(); };
  const visibility = () => {
    visible = !document.hidden;
    if (visible) clock.getDelta();
  };
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerdown", (event) => { pointerOrigin = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener("pointerup", () => { pointerOrigin = null; });
  renderer.domElement.addEventListener("pointerleave", () => { pointerOrigin = null; hideHoverCard(); });
  renderer.domElement.addEventListener("wheel", wheel, { passive: true });
  renderer.domElement.addEventListener("click", click);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  document.addEventListener("visibilitychange", visibility);

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width, height);
    labelRenderer.setSize(width, height);
    nodeMaterial.uniforms.uPixelScale.value = height * renderer.getPixelRatio() / (2 * Math.tan((camera.fov * Math.PI) / 360));
    nebula.setPixelScale(nodeMaterial.uniforms.uPixelScale.value, 960);
    clusterClouds.setPixelScale(nodeMaterial.uniforms.uPixelScale.value, 260);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersectionObserver = typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(([entry]) => {
        intersecting = entry?.isIntersecting ?? true;
        if (intersecting) clock.getDelta();
      }, { threshold: 0.01 });
  intersectionObserver?.observe(host);
  resize();
  applyState(true);

  const labelWorldPosition = new THREE.Vector3();
  const labelProjection = new THREE.Vector3();
  const updateLabelCollisions = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 1 || height < 1) return;
    const cellSize = 88;
    const occupied = new Map<string, Array<{ left: number; right: number; top: number; bottom: number }>>();
    const entries = [...labelObjects.entries()]
      .filter(([nodeId]) => !labels.get(nodeId)?.classList.contains("is-quiet"))
      .sort(([leftId], [rightId]) => (
        visibleLabelPriority(labels.get(rightId), nodeById.get(rightId))
        - visibleLabelPriority(labels.get(leftId), nodeById.get(leftId))
      ));
    entries.forEach(([nodeId, label]) => {
      const element = labels.get(nodeId);
      const node = nodeById.get(nodeId);
      if (!element || !node) return;
      label.getWorldPosition(labelProjection);
      labelProjection.project(camera);
      const textWidth = Math.min(node.kind === "evidence" ? 164 : 136, 28 + node.label.length * 7);
      const textHeight = element.classList.contains("is-local-company") || element.classList.contains("is-active") ? 30 : 18;
      const centerX = (labelProjection.x * 0.5 + 0.5) * width;
      const centerY = (-labelProjection.y * 0.5 + 0.5) * height;
      const rect = {
        left: centerX - textWidth / 2,
        right: centerX + textWidth / 2,
        top: centerY - textHeight / 2,
        bottom: centerY + textHeight / 2,
      };
      const outside = labelProjection.z < -1 || labelProjection.z > 1 || rect.right < 0 || rect.left > width || rect.bottom < 0 || rect.top > height;
      const minCellX = Math.floor(rect.left / cellSize);
      const maxCellX = Math.floor(rect.right / cellSize);
      const minCellY = Math.floor(rect.top / cellSize);
      const maxCellY = Math.floor(rect.bottom / cellSize);
      let colliding = outside;
      for (let cellX = minCellX; !colliding && cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; !colliding && cellY <= maxCellY; cellY += 1) {
          const rows = occupied.get(`${cellX}:${cellY}`) ?? [];
          colliding = rows.some((row) => rect.left < row.right && rect.right > row.left && rect.top < row.bottom && rect.bottom > row.top);
        }
      }
      element.classList.toggle("is-colliding", colliding);
      if (colliding) return;
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = `${cellX}:${cellY}`;
          const rows = occupied.get(key) ?? [];
          rows.push(rect);
          occupied.set(key, rows);
        }
      }
    });
  };

  const idleFrameDuration = quality.tier === "full" ? 0 : quality.tier === "balanced" ? 1_000 / 45 : 1_000 / 30;
  const labelRenderStride = quality.tier === "full" ? 1 : quality.tier === "balanced" ? 2 : 3;
  const animate = (time = 0) => {
    animationFrame = requestAnimationFrame(animate);
    if (!visible || !intersecting) return;
    const localTransition = layoutSettling && (interaction.focusedCategoryId !== null || interaction.focusedCompanyCode !== null);
    const targetFrameDuration = localTransition ? 0 : idleFrameDuration;
    if (targetFrameDuration > 0 && time - lastRenderedAt < targetFrameDuration) return;
    lastRenderedAt = time;
    renderFrame += 1;
    const delta = Math.min(clock.getDelta(), 0.05);
    elapsed += delta;
    if (reveal) {
      graphGroup.scale.x += (1 - graphGroup.scale.x) * 0.055;
      graphGroup.scale.y += (1 - graphGroup.scale.y) * 0.055;
      graphGroup.scale.z += (1 - graphGroup.scale.z) * 0.055;
      graphGroup.rotation.z *= 0.94;
      if (graphGroup.scale.x > 0.985) reveal = false;
    }
    stars.group.rotation.y = elapsed * 0.0008;
    fieldStars.rotation.y = -elapsed * 0.003;
    stars.twinkler.update(delta, quality.tier === "full" ? 0.5 : 0.25);
    nebula.update(delta);
    linkMaterial.uniforms.uTime.value = elapsed;
    if (pulsePoints.visible && (quality.tier === "full" || renderFrame % 2 === 0)) {
      updatePulsePositions(
        linkPositions,
        pulsePositions,
        renderEdges,
        linkK,
        pulseCountPerEdge,
        elapsed * (interaction.focusedCategoryId !== null || interaction.focusedCompanyCode !== null ? 1.28 : 1),
        activePulseEdgeIndexes,
      );
      (pulseGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    if (focusOrbits.visible) {
      focusOrbits.rotation.y += delta * 0.055;
      focusOrbits.rotation.z -= delta * 0.018;
    }
    graphDust.points.rotation.y = -elapsed * 0.009;
    graphDust.points.rotation.x = Math.sin(elapsed * 0.04) * 0.025;
    if (layoutSettling) {
      let largestMove = 0;
      const positionAlpha = 1 - Math.exp(-delta * 7.2);
      for (const nodePositionIndex of activeLayoutNodeIndexes) {
        const offset = nodePositionIndex * 3;
        for (let axis = 0; axis < 3; axis += 1) {
          const movement = (targetNodePositions[offset + axis] - nodePositions[offset + axis]) * positionAlpha;
          nodePositions[offset + axis] += movement;
          largestMove = Math.max(largestMove, Math.abs(movement));
        }
      }
      graphGroup.rotation.z += (targetGroupRotationZ - graphGroup.rotation.z) * positionAlpha;
      (nodeGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      fillLinkPositions(linkPositions, nodePositions, activeRenderEdgePairs, linkK, interaction.focusedCategoryId === null && interaction.focusedCompanyCode === null ? 0.31 : 0.16);
      (linkGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      updateEdgeLabelPositions();
      nodes.forEach((node, index) => {
        const label = labelObjects.get(node.id);
        if (!label) return;
        label.position.set(nodePositions[index * 3], nodePositions[index * 3 + 1] + (node.kind === "category" ? 2.2 : 1.4), nodePositions[index * 3 + 2]);
      });
      if (interaction.focusedCategoryId !== null || interaction.focusedCompanyCode !== null) {
        const focusIndex = nodeIndex.get(interaction.focusedCompanyCode !== null ? `company:${interaction.focusedCompanyCode}` : `category:${interaction.focusedCategoryId}`);
        if (focusIndex !== undefined) {
          const x = nodePositions[focusIndex * 3];
          const y = nodePositions[focusIndex * 3 + 1];
          const z = nodePositions[focusIndex * 3 + 2];
          focusHalo.position.set(x, y, z - 0.8);
          focusOrbits.position.set(x, y, z);
        }
      }
      if (largestMove < 0.012) {
        nodePositions.set(targetNodePositions);
        layoutSettling = false;
        fillLinkPositions(linkPositions, nodePositions, activeRenderEdgePairs, linkK, interaction.focusedCategoryId === null && interaction.focusedCompanyCode === null ? 0.31 : 0.16);
        (nodeGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (linkGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        updateEdgeLabelPositions();
      }
    }
    graphDust.material.opacity += (((interaction.focusedCategoryId === null && interaction.focusedCompanyCode === null) ? 0.88 : 0.24) - graphDust.material.opacity) * 0.06;
    if (cameraFollowing) {
      camera.position.lerp(targetCamera, 1 - Math.exp(-delta * 4.4));
      controls.target.lerp(targetControl, 1 - Math.exp(-delta * 5.7));
    }
    controls.update();
    if ((interaction.focusedCategoryId !== null || interaction.focusedCompanyCode !== null) && renderFrame % 3 === 0) {
      const depthSpan = Math.max(localVisibleRadius * 2.8, 90);
      labelObjects.forEach((label, nodeId) => {
        const element = labels.get(nodeId);
        if (!element || element.classList.contains("is-quiet")) return;
        label.getWorldPosition(labelWorldPosition);
        const distance = camera.position.distanceTo(labelWorldPosition);
        const depth = THREE.MathUtils.clamp(1.18 - distance / depthSpan, 0, 1);
        element.style.setProperty("--atlas-depth-scale", (0.84 + depth * 0.22).toFixed(3));
        element.style.setProperty("--atlas-depth-brightness", (0.72 + depth * 0.38).toFixed(3));
      });
    }
    composer.render();
    if (layoutSettling || renderFrame % labelRenderStride === 0) {
      updateLabelCollisions();
      labelRenderer.render(scene, camera);
    }
  };
  animate();

  return {
    setInteractionState(next) {
      const focusChanged = interaction.focusedCategoryId !== next.focusedCategoryId
        || interaction.focusedCompanyCode !== next.focusedCompanyCode
        || interaction.expandedCompanyBranch !== next.expandedCompanyBranch;
      interaction = next;
      applyState(focusChanged);
    },
    zoomBy(factor) {
      releaseCamera();
      camera.position.sub(controls.target).multiplyScalar(THREE.MathUtils.clamp(factor, 0.62, 1.6)).add(controls.target);
      targetCamera.copy(camera.position);
    },
    resetView() {
      setCameraTarget();
    },
    setAutoRotate(enabled) {
      releaseCamera();
      controls.autoRotate = enabled;
    },
    dispose() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      intersectionObserver?.disconnect();
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibility);
      controls.dispose();
      resources.forEach((resource) => resource.dispose());
      disposeStarfield(stars.group);
      fieldStars.geometry.dispose();
      fieldStars.material.dispose();
      nebula.dispose();
      clusterClouds.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      labelRenderer.domElement.remove();
      hoverCard.remove();
      renderer.domElement.remove();
    },
  };
}

function buildRelationCategories(graph: IndustryGraphPayload) {
  const categories = new Map<string, Set<number>>();
  graph.edges.filter((edge): edge is Extract<IndustryGraphEdge, { kind: "relation" }> => edge.kind === "relation").forEach((edge) => {
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints) return;
    const rows = categories.get(endpoints.companyNodeId) ?? new Set<number>();
    rows.add(endpoints.categoryId);
    categories.set(endpoints.companyNodeId, rows);
  });
  graph.edges.filter((edge): edge is Extract<IndustryGraphEdge, { kind: "entityRelation" }> => edge.kind === "entityRelation").forEach((edge) => {
    const rows = categories.get(edge.target) ?? new Set<number>();
    for (const categoryId of categories.get(edge.source) ?? []) rows.add(categoryId);
    categories.set(edge.target, rows);
  });
  graph.edges.filter((edge): edge is Extract<IndustryGraphEdge, { kind: "evidenceLink" }> => edge.kind === "evidenceLink").forEach((edge) => {
    const rows = categories.get(edge.target) ?? new Set<number>();
    for (const categoryId of categories.get(edge.source) ?? []) rows.add(categoryId);
    categories.set(edge.target, rows);
  });
  return categories;
}

function writeLinkColor(colorBuffer: Float32Array, edgeIndex: number, segments: number, color: THREE.Color) {
  const offset = edgeIndex * segments * 6;
  for (let segment = 0; segment < segments * 2; segment += 1) color.toArray(colorBuffer, offset + segment * 3);
}

function writePulseColor(colorBuffer: Float32Array, edgeIndex: number, countPerEdge: number, color: THREE.Color) {
  for (let pulse = 0; pulse < countPerEdge; pulse += 1) color.toArray(colorBuffer, (edgeIndex * countPerEdge + pulse) * 3);
}

function updatePulsePositions(
  linkPositions: Float32Array,
  pulsePositions: Float32Array,
  edges: RenderEdge[],
  segments: number,
  countPerEdge: number,
  elapsed: number,
  activeEdgeIndexes: number[],
) {
  if (!countPerEdge || !activeEdgeIndexes.length) return;
  for (const edgeIndex of activeEdgeIndexes) {
    for (let pulse = 0; pulse < countPerEdge; pulse += 1) {
      const forwardProgress = (elapsed * (0.055 + (edgeIndex % 5) * 0.006) + edgeIndex * 0.173 + pulse / countPerEdge) % 1;
      const currentEdge = edges[edgeIndex]?.edge;
      const shouldReverse = currentEdge?.kind === "relation"
        ? currentEdge.direction === "outbound"
        : currentEdge?.kind === "entityRelation"
          ? currentEdge.direction === "inbound"
          : false;
      const progress = shouldReverse
        ? 1 - forwardProgress
        : forwardProgress;
      const segmentProgress = progress * segments;
      const segment = Math.min(segments - 1, Math.floor(segmentProgress));
      const mix = segmentProgress - segment;
      const source = (edgeIndex * segments + segment) * 6;
      const target = source + 3;
      const output = (edgeIndex * countPerEdge + pulse) * 3;
      pulsePositions[output] = THREE.MathUtils.lerp(linkPositions[source] ?? 0, linkPositions[target] ?? 0, mix);
      pulsePositions[output + 1] = THREE.MathUtils.lerp(linkPositions[source + 1] ?? 0, linkPositions[target + 1] ?? 0, mix);
      pulsePositions[output + 2] = THREE.MathUtils.lerp(linkPositions[source + 2] ?? 0, linkPositions[target + 2] ?? 0, mix);
    }
  }
}

type EdgeSemanticKind = "upstream" | "downstream" | "core" | "organization" | "peer" | "category" | "neutral";

function edgeStrength(edge: IndustryGraphEdge) {
  return "strength" in edge ? edge.strength ?? 0 : 0;
}

function edgeSemantic(edge: IndustryGraphEdge): { kind: EdgeSemanticKind; label: string } {
  if (edge.id.startsWith("derived-peer:")) return { kind: "peer", label: "同业" };
  if (edge.kind === "relation") return { kind: "category", label: "产业归属" };
  if (edge.kind === "entityRelation") {
    if (edge.relationType === "竞争关系") return { kind: "peer", label: "竞争" };
    if (edge.direction === "inbound") return { kind: "upstream", label: "供应" };
    if (edge.direction === "outbound") return { kind: "downstream", label: "客户" };
    if (edge.relationType === "项目进展") return { kind: "organization", label: "组织" };
    if (edge.relationType === "核心产品") return { kind: "core", label: "业务" };
    if (edge.relationType === "技术关联") return { kind: "core", label: "技术" };
    return { kind: "core", label: "业务" };
  }
  return { kind: "neutral", label: "关联" };
}

function edgeSemanticColor(edge: IndustryGraphEdge, fallback: THREE.Color) {
  const semantic = edgeSemantic(edge).kind;
  if (semantic === "upstream") return new THREE.Color(0x5fe0be);
  if (semantic === "downstream") return new THREE.Color(0x6faeff);
  if (semantic === "core") return new THREE.Color(0xf0c967);
  if (semantic === "organization") return new THREE.Color(0x8fd8d0);
  if (semantic === "peer") return new THREE.Color(0xc58bf3);
  if (semantic === "category") return new THREE.Color(0xe9c86c);
  return fallback.clone();
}

function edgePattern(edge: IndustryGraphEdge) {
  const semantic = edgeSemantic(edge).kind;
  if (semantic === "peer") return 2;
  if (semantic === "organization") return 1;
  return 0;
}

function buildDerivedPeerEdges(graph: IndustryGraphPayload): IndustryGraphEdge[] {
  const memberships = new Map<string, Map<number, number>>();
  const categoryMembers = new Map<number, string[]>();
  graph.edges.forEach((edge) => {
    if (edge.kind !== "relation") return;
    const endpoints = getRelationEndpoints(edge);
    if (!endpoints) return;
    const rows = memberships.get(endpoints.companyNodeId) ?? new Map<number, number>();
    rows.set(endpoints.categoryId, Math.max(rows.get(endpoints.categoryId) ?? 0, edge.evidenceCount));
    memberships.set(endpoints.companyNodeId, rows);
    const members = categoryMembers.get(endpoints.categoryId) ?? [];
    if (!members.includes(endpoints.companyNodeId)) members.push(endpoints.companyNodeId);
    categoryMembers.set(endpoints.categoryId, members);
  });
  const detailedCompanyIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "entityRelation" && !edge.id.startsWith("derived-peer:"))
      .map((edge) => edge.source),
  );
  const companyIds = [...detailedCompanyIds]
    .filter((companyId) => memberships.has(companyId))
    .sort();
  const edges: IndustryGraphEdge[] = [];
  companyIds.forEach((source, sourceIndex) => {
    const sourceCategories = memberships.get(source);
    if (!sourceCategories?.size) return;
    const candidateScores = new Map<string, number>();
    sourceCategories.forEach((sourceEvidenceCount, categoryId) => {
      (categoryMembers.get(categoryId) ?? []).forEach((target) => {
        if (target === source) return;
        const targetEvidenceCount = memberships.get(target)?.get(categoryId) ?? 0;
        candidateScores.set(target, (candidateScores.get(target) ?? 0) + 100 + sourceEvidenceCount + targetEvidenceCount);
      });
    });
    [...candidateScores.entries()].map(([target, score]) => ({ target, score }))
      .sort((left, right) => right.score - left.score || left.target.localeCompare(right.target))
      .slice(0, 4)
      .forEach((candidate, index) => {
        edges.push({
          id: `derived-peer:${source}->${candidate.target}`,
          source,
          target: candidate.target,
          kind: "entityRelation",
          relationId: -(sourceIndex * 10 + index + 1),
          relationType: "竞争关系",
          confidence: "中",
          evidenceCount: 0,
          rationale: "由共同产业分类推导的同业关系，不代表客户或供应商关系。",
          isWatchlist: false,
          evidencePreviews: [],
          direction: "undirected",
          strength: 58,
          observedAt: "",
          verificationStatus: "unverified",
        });
      });
  });
  return edges;
}

function createHoverTitle(node: IndustryGraphNode) {
  const title = document.createElement("strong");
  title.textContent = node.label;
  return title;
}

function createHoverMeta(node: IndustryGraphNode) {
  const meta = document.createElement("span");
  if (node.kind === "company") meta.textContent = `${node.stockCode} · ${node.relationType} · ${node.confidence}置信 · ${node.evidenceCount} 条证据`;
  else if (node.kind === "category") meta.textContent = `产业节点 · 第 ${node.level + 1} 层`;
  else if (node.kind === "entity") meta.textContent = `${node.entityType} · ${node.evidenceCount} 条关联证据`;
  else meta.textContent = `${node.sourceType} · ${node.credibility}可信度 · ${node.sourceDate || "时间待补"}`;
  return meta;
}

function createHoverDescription(node: IndustryGraphNode) {
  const description = document.createElement("p");
  if (node.kind === "company") {
    description.textContent = firstNonEmpty(node.summary ?? "", node.mainBusiness ?? "", `${node.industry || "行业待补"} · ${node.board || "上市板待补"}`);
  } else if (node.kind === "entity") {
    description.textContent = node.summary || "该研究实体尚待补充摘要。";
  } else if (node.kind === "evidence") {
    description.textContent = firstNonEmpty(node.excerpt, node.url, "点击查看证据快照与原文入口。");
  } else {
    description.textContent = "点击聚焦该产业链节点，展开相关公司与上下游关系。";
  }
  return description;
}

function firstNonEmpty(...values: string[]) {
  const value = values.map((item) => item.trim()).find(Boolean) ?? "资料待补";
  const sentence = value.split(/[。！？]/).map((item) => item.trim()).find(Boolean) ?? value;
  return sentence.length > 78 ? `${sentence.slice(0, 78)}...` : sentence;
}

function visibleLabelPriority(element: HTMLElement | undefined, node: IndustryGraphNode | undefined) {
  if (!element || !node) return 0;
  if (element.classList.contains("is-active")) return 10_000;
  if (element.classList.contains("is-local-focus")) return 9_000;
  if (element.classList.contains("is-local-direct")) return 8_000;
  if (element.classList.contains("is-edge-endpoint")) return 7_000;
  if (node.kind === "category") return 6_000;
  if (node.kind === "company") return 5_000;
  if (node.kind === "entity") return 4_000;
  return 3_000;
}

function clusterColor(index: number) {
  return new THREE.Color([0x8da9dc, 0xd6a56e, 0xab8ddd, 0x68b6a6, 0xd37c9a, 0x86a0c8][index % 6]);
}

function createFocusHaloTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const center = 128;
  const gradient = context.createRadialGradient(center, center, 0, center, center, 124);
  gradient.addColorStop(0, "rgba(255,244,207,.2)");
  gradient.addColorStop(0.08, "rgba(240,201,103,.17)");
  gradient.addColorStop(0.24, "rgba(240,201,103,.075)");
  gradient.addColorStop(0.58, "rgba(240,201,103,.015)");
  gradient.addColorStop(1, "rgba(240,201,103,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPulseTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,.92)");
  gradient.addColorStop(0.48, "rgba(255,255,255,.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFocusOrbits(resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>) {
  const group = new THREE.Group();
  const rows = [
    { radius: 28, x: 0.82, y: 0.18, z: 0.08, opacity: 0.17 },
    { radius: 40, x: 1.16, y: -0.42, z: 0.3, opacity: 0.12 },
    { radius: 54, x: 0.48, y: 0.72, z: -0.22, opacity: 0.075 },
  ];
  rows.forEach((row) => {
    const points = Array.from({ length: 128 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * row.radius, Math.sin(angle) * row.radius, 0);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({ color: 0xf0c967, transparent: true, opacity: row.opacity, dashSize: 2.2, gapSize: 3.4, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.LineLoop(geometry, material);
    ring.rotation.set(row.x, row.y, row.z);
    ring.computeLineDistances();
    group.add(ring);
    resources.push(geometry, material);
  });
  return group;
}

function graphRadius(positions: Float32Array) {
  let radius = 12;
  for (let index = 0; index < positions.length; index += 3) radius = Math.max(radius, Math.hypot(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0));
  return radius;
}

function graphRadiusForNodeIds(positions: Float32Array, nodeIndex: Map<string, number>, nodeIds: Set<string>) {
  let radius = 12;
  nodeIds.forEach((nodeId) => {
    const index = nodeIndex.get(nodeId);
    if (index === undefined) return;
    const offset = index * 3;
    radius = Math.max(radius, Math.hypot(positions[offset] ?? 0, positions[offset + 1] ?? 0, positions[offset + 2] ?? 0));
  });
  return radius;
}

function buildGraphDust(radius: number, tier: "full" | "balanced" | "reduced") {
  const count = tier === "full" ? 2_600 : tier === "balanced" ? 1_300 : 420;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 0x6a09e667;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    const shell = random() < 0.72;
    const distance = radius * (shell ? 0.68 + random() * 0.34 : 0.1 + Math.cbrt(random()) * 0.66);
    positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = distance * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = distance * Math.cos(phi);
    const warm = random() > 0.93;
    const intensity = shell ? 0.72 + random() * 0.72 : 0.24 + random() * 0.5;
    colors[index * 3] = (warm ? 1 : 0.55) * intensity;
    colors[index * 3 + 1] = (warm ? 0.79 : 0.68) * intensity;
    colors[index * 3 + 2] = (warm ? 0.5 : 1) * intensity;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.72, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 0;
  points.frustumCulled = false;
  return { points, geometry, material };
}
