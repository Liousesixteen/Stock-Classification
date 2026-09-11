"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { chooseGraphQuality, createGraphLayout, getCompanyFocusedGraphNeighborhood, getFocusedGraphNeighborhood, type GraphPosition, type GraphQuality } from "@/lib/industry-graph/layout";
import type { CompanyGraphBranch } from "@/lib/industry-graph/layout";
import { getRelationEndpoints } from "@/lib/industry-graph/relations";
import type { IndustryGraphDisplaySettings, IndustryGraphNode, IndustryGraphPayload, IndustryGraphSignalFilter } from "@/lib/industry-graph/types";
import { mountGalaxyRenderer, type GalaxyRuntime } from "./GalaxyRenderer";

export type GalaxyViewController = Pick<GalaxyRuntime, "zoomBy" | "resetView" | "setAutoRotate">;

export type IndustryGraphSceneProps = {
  graph: IndustryGraphPayload;
  focusedCategoryId: number | null;
  focusedCompanyCode: string | null;
  expandedCompanyBranch: CompanyGraphBranch | null;
  selectedNodeId: string | null;
  highlightedPathNodeIds: string[];
  signalFilter: IndustryGraphSignalFilter;
  displaySettings: IndustryGraphDisplaySettings;
  onSelectNode: (node: IndustryGraphNode) => void;
  onWebGlFailure: () => void;
  onRuntimeReady?: (runtime: GalaxyViewController | null) => void;
};

type GraphSceneRuntime = {
  setInteractionState: (state: Pick<IndustryGraphSceneProps, "focusedCategoryId" | "focusedCompanyCode" | "expandedCompanyBranch" | "selectedNodeId" | "highlightedPathNodeIds" | "signalFilter">) => void;
  dispose: () => void;
};

export function IndustryGraphScene({ graph, focusedCategoryId, focusedCompanyCode, expandedCompanyBranch, selectedNodeId, highlightedPathNodeIds, signalFilter, displaySettings, onSelectNode, onWebGlFailure, onRuntimeReady }: IndustryGraphSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GalaxyRuntime | null>(null);
  const onSelectRef = useRef(onSelectNode);
  const onFailureRef = useRef(onWebGlFailure);
  onSelectRef.current = onSelectNode;
  onFailureRef.current = onWebGlFailure;
  const accessibleNodes = useMemo(() => {
    if (focusedCompanyCode !== null) {
      const visibleNodeIds = getCompanyFocusedGraphNeighborhood(graph, focusedCompanyCode, expandedCompanyBranch).visibleNodeIds;
      return graph.nodes.filter((node) => visibleNodeIds.has(node.id));
    }
    if (focusedCategoryId !== null) {
      const visibleNodeIds = getFocusedGraphNeighborhood(graph, focusedCategoryId).visibleNodeIds;
      return graph.nodes.filter((node) => visibleNodeIds.has(node.id));
    }
    return graph.nodes.filter((node) => node.kind === "category" && node.level <= 1);
  }, [expandedCompanyBranch, focusedCategoryId, focusedCompanyCode, graph]);

  useEffect(() => {
    if (!hostRef.current) return;
    let runtime: GalaxyRuntime;
    try {
      runtime = mountGalaxyRenderer(hostRef.current, graph, (node) => onSelectRef.current(node), () => onFailureRef.current());
    } catch {
      onFailureRef.current();
      return;
    }
    runtimeRef.current = runtime;
    onRuntimeReady?.(runtime);
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
      onRuntimeReady?.(null);
    };
  }, [graph, onRuntimeReady]);

  useEffect(() => {
    runtimeRef.current?.setInteractionState({ focusedCategoryId, focusedCompanyCode, expandedCompanyBranch, selectedNodeId, highlightedPathNodeIds, signalFilter, displaySettings });
  }, [focusedCategoryId, focusedCompanyCode, expandedCompanyBranch, selectedNodeId, highlightedPathNodeIds, signalFilter, displaySettings]);

  return (
    <div className="industry-graph-scene" ref={hostRef} data-testid="industry-graph-canvas-host">
      <div className="sr-only" data-testid="atlas-node-list" aria-label="图谱节点列表">
        {accessibleNodes.map((node) => (
          <button key={node.id} type="button" onClick={() => onSelectNode(node)}>{node.label}</button>
        ))}
      </div>
    </div>
  );
}

export function mountIndustryGraphScene(
  host: HTMLDivElement,
  graph: IndustryGraphPayload,
  onSelect: (node: IndustryGraphNode) => void,
  onFailure: () => void,
): GraphSceneRuntime {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060d, 0.017);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180);
  camera.position.set(0, 10, 34);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.domElement.dataset.testid = "industry-graph-canvas";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const quality = chooseGraphQuality({
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemory: memory,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  host.prepend(renderer.domElement);
  const composer = quality.tier === "reduced" ? null : new EffectComposer(renderer);
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), quality.tier === "full" ? 0.52 : 0.34, 0.42, 0.62));
  }

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "atlas-label-layer";
  host.appendChild(labelRenderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 8;
  controls.maxDistance = 72;
  controls.autoRotate = !quality.tier.includes("reduced");
  controls.autoRotateSpeed = 0.28;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  scene.add(new THREE.AmbientLight(0xbac7ff, 1.05));
  const light = new THREE.PointLight(0x9fb7ff, 52, 72);
  light.position.set(0, 10, 14);
  scene.add(light);
  const coreLight = new THREE.PointLight(0xffdda3, 26, 45);
  coreLight.position.set(-6, -2, 8);
  scene.add(coreLight);

  const positions = createGraphLayout(graph);
  const flowPacketsPerEdge = quality.tier === "full" ? 3 : quality.particlesPerEdge;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const categoryById = new Map(graph.nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category").map((node) => [node.categoryId, node]));
  const meshById = new Map<string, THREE.Mesh>();
  const glowById = new Map<string, THREE.Sprite>();
  const labelById = new Map<string, HTMLElement>();
  const relatedCategoryIds = new Map<string, Set<number>>();
  const flowCurves: Array<{ curve: THREE.QuadraticBezierCurve3; color: THREE.Color; phase: number; speed: number; source: string; target: string }> = [];
  const edgeVisuals: Array<{ source: string; target: string; material: THREE.LineBasicMaterial; baseOpacity: number }> = [];
  const resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const graphGroup = new THREE.Group();
  scene.add(graphGroup);
  const glowTexture = createGlowTexture();
  resources.push(glowTexture);

  graph.edges.forEach((edge) => {
    if (edge.kind === "relation") {
      const endpoints = getRelationEndpoints(edge);
      if (endpoints) {
        const companyCategories = relatedCategoryIds.get(endpoints.companyNodeId) ?? new Set<number>();
        companyCategories.add(endpoints.categoryId);
        relatedCategoryIds.set(endpoints.companyNodeId, companyCategories);
      }
    } else if (edge.kind === "entityRelation") {
      const entityCategories = relatedCategoryIds.get(edge.target) ?? new Set<number>();
      for (const categoryId of relatedCategoryIds.get(edge.source) ?? []) entityCategories.add(categoryId);
      relatedCategoryIds.set(edge.target, entityCategories);
    } else if (edge.kind === "evidenceLink") {
      const evidenceCategories = relatedCategoryIds.get(edge.target) ?? new Set<number>();
      for (const categoryId of relatedCategoryIds.get(edge.source) ?? []) evidenceCategories.add(categoryId);
      relatedCategoryIds.set(edge.target, evidenceCategories);
    }
    const from = positions[edge.source];
    const to = positions[edge.target];
    if (!from || !to) return;
    const color = edge.kind === "hierarchy" ? 0x526486 : edge.kind === "evidenceLink" ? 0xe9c86c : relationColor(edge.relationType);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + (edge.kind === "hierarchy" ? 0.55 : 1.15), (from[2] + to[2]) / 2),
      new THREE.Vector3(...to),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(edge.kind === "hierarchy" ? 12 : 20));
    const baseOpacity = edge.kind === "hierarchy" ? 0.24 : 0.42;
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: baseOpacity, blending: THREE.AdditiveBlending });
    resources.push(geometry, material);
    graphGroup.add(new THREE.Line(geometry, material));
    edgeVisuals.push({ source: edge.source, target: edge.target, material, baseOpacity });
    if (quality.particlesPerEdge > 0) {
      flowCurves.push({
        curve,
        color: new THREE.Color(color),
        phase: ((edge.id.length * 37 + flowCurves.length * 17) % 100) / 100,
        speed: edge.kind === "hierarchy" ? 0.055 : 0.09,
        source: edge.source,
        target: edge.target,
      });
    }
  });

  const flowPointCount = flowCurves.length * flowPacketsPerEdge;
  const flowPositions = new Float32Array(flowPointCount * 3);
  const flowColors = new Float32Array(flowPointCount * 3);
  const flowGeometry = new THREE.BufferGeometry();
  flowGeometry.setAttribute("position", new THREE.BufferAttribute(flowPositions, 3));
  flowGeometry.setAttribute("color", new THREE.BufferAttribute(flowColors, 3));
  flowCurves.forEach((flow, edgeIndex) => {
    for (let packetIndex = 0; packetIndex < flowPacketsPerEdge; packetIndex += 1) {
      const index = edgeIndex * flowPacketsPerEdge + packetIndex;
      flow.color.toArray(flowColors, index * 3);
    }
  });
  const flowColorAttribute = flowGeometry.getAttribute("color") as THREE.BufferAttribute;
  const flowMaterial = new THREE.PointsMaterial({
    size: quality.tier === "full" ? 0.23 : 0.16,
    transparent: true,
    opacity: 0.95,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  resources.push(flowGeometry, flowMaterial);
  const flowPoints = new THREE.Points(flowGeometry, flowMaterial);
  flowPoints.frustumCulled = false;
  graphGroup.add(flowPoints);
  const flowHaloMaterial = new THREE.PointsMaterial({
    size: quality.tier === "full" ? 0.52 : 0.34,
    transparent: true,
    opacity: 0.12,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  resources.push(flowHaloMaterial);
  const flowHalos = new THREE.Points(flowGeometry, flowHaloMaterial);
  flowHalos.frustumCulled = false;
  graphGroup.add(flowHalos);

  graph.nodes.forEach((node) => {
    const isCategory = node.kind === "category";
    const isEntity = node.kind === "entity";
    const isEvidence = node.kind === "evidence";
    const radius = isCategory ? Math.max(0.5, 1.05 - node.level * 0.1) : isEntity ? 0.39 : isEvidence ? 0.19 : node.relationType === "主营业务" ? 0.34 : 0.25;
    const geometry = isCategory ? new THREE.IcosahedronGeometry(radius, 1) : isEntity || isEvidence ? new THREE.OctahedronGeometry(radius, 0) : new THREE.SphereGeometry(radius, 16, 12);
    const color = isCategory ? 0x5fffd0 : isEntity ? entityColor(node.entityType) : isEvidence ? 0xe9c86c : relationColor(node.relationType);
    const material = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: isCategory ? 0.16 : 0.1, roughness: 0.32, metalness: 0.2, transparent: true });
    resources.push(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...positions[node.id]);
    mesh.userData.nodeId = node.id;
    graphGroup.add(mesh);
    meshById.set(node.id, mesh);

    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: isCategory ? 0.13 : isEntity ? 0.1 : 0.065,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    resources.push(glowMaterial);
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(radius * (isCategory ? 3.1 : isEntity ? 2.7 : 2.25));
    mesh.add(glow);
    glowById.set(node.id, glow);

    const element = document.createElement("span");
    element.className = `atlas-node-label is-quiet ${isCategory ? "is-category" : node.kind === "company" ? "is-company" : isEntity ? "is-entity" : "is-evidence"}`;
    const labelText = document.createElement("b");
    labelText.textContent = node.label;
    element.append(labelText);
    if (node.kind === "company") {
      const stockCode = document.createElement("small");
      stockCode.textContent = node.stockCode;
      element.append(stockCode);
    } else if (node.kind === "evidence") {
      const source = document.createElement("small");
      source.textContent = node.sourceType;
      element.append(source);
    }
    const label = new CSS2DObject(element);
    label.position.set(0, radius + 0.34, 0);
    mesh.add(label);
    labelById.set(node.id, element);
  });

  const nodeRootIds = new Map<string, number>();
  const rootCategories = graph.nodes.filter((node): node is Extract<IndustryGraphNode, { kind: "category" }> => node.kind === "category" && node.parentId === null);
  const categoryRootId = (categoryId: number) => {
    let category = categoryById.get(categoryId);
    while (category?.parentId !== null && category?.parentId !== undefined) category = categoryById.get(category.parentId);
    return category?.categoryId ?? categoryId;
  };
  graph.nodes.forEach((node) => {
    if (node.kind === "category") {
      nodeRootIds.set(node.id, categoryRootId(node.categoryId));
      return;
    }
    const relationCategories = [...(relatedCategoryIds.get(node.id) ?? [])];
    if (relationCategories[0] !== undefined) nodeRootIds.set(node.id, categoryRootId(relationCategories[0]));
  });

  const clusterDust = createClusterDust({ graph, positions, nodeRootIds, rootCategories, quality });
  resources.push(clusterDust.geometry, clusterDust.material);
  graphGroup.add(clusterDust.points);

  rootCategories.forEach((category, index) => {
    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color: clusterColor(index),
      transparent: true,
      opacity: 0.018,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    resources.push(material);
    const cloud = new THREE.Sprite(material);
    cloud.position.set(...positions[category.id]);
    cloud.scale.set(7.5, 7.5, 1);
    cloud.userData.clusterIndex = index;
    graphGroup.add(cloud);
  });

  const starGeometry = new THREE.BufferGeometry();
  const starCount = quality.tier === "full" ? 1700 : quality.tier === "balanced" ? 1050 : 460;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index += 1) {
    const radius = 34 + Math.random() * 48;
    const angle = Math.random() * Math.PI * 2;
    starPositions[index * 3] = Math.cos(angle) * radius;
    starPositions[index * 3 + 1] = (Math.random() - 0.5) * 50;
    starPositions[index * 3 + 2] = Math.sin(angle) * radius;
    const starColor = new THREE.Color(index % 13 === 0 ? 0xffe6aa : index % 7 === 0 ? 0xb9c9ff : index % 11 === 0 ? 0xd3b8ff : 0x7184ac);
    starColor.toArray(starColors, index * 3);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starMaterial = new THREE.PointsMaterial({ size: 0.047, transparent: true, opacity: 0.68, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending });
  resources.push(starGeometry, starMaterial);
  scene.add(new THREE.Points(starGeometry, starMaterial));

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const selectable = [...meshById.values()];
  let hoveredId: string | null = null;
  let interaction = { focusedCategoryId: null as number | null, selectedNodeId: null as string | null, highlightedPathNodeIds: [] as string[], signalFilter: "all" as IndustryGraphSignalFilter };
  let frame = 0;
  let visible = !document.hidden;
  const clock = new THREE.Clock();
  const targetGroupPosition = new THREE.Vector3();
  const targetCameraPosition = new THREE.Vector3(0, 10, 34);
  const targetControlPosition = new THREE.Vector3();
  let targetGroupScale = 1;
  let isTransitioning = true;
  let isRevealing = true;
  graphGroup.scale.setScalar(0.12);
  graphGroup.rotation.z = -0.22;

  const belongsToFocus = (categoryId: number, focusId: number) => {
    let category = categoryById.get(categoryId);
    while (category) {
      if (category.categoryId === focusId) return true;
      category = category.parentId === null ? undefined : categoryById.get(category.parentId);
    }
    return false;
  };
  const isFocusAncestor = (categoryId: number, focusId: number) => {
    let category = categoryById.get(focusId);
    while (category && category.parentId !== null) {
      if (category.parentId === categoryId) return true;
      category = categoryById.get(category.parentId);
    }
    return false;
  };
  const isNodeInFocus = (node: IndustryGraphNode | undefined) => {
    const focusId = interaction.focusedCategoryId;
    if (!node || focusId === null) return true;
    if (node.kind === "category") return belongsToFocus(node.categoryId, focusId);
    return [...(relatedCategoryIds.get(node.id) ?? [])].some((categoryId) => belongsToFocus(categoryId, focusId));
  };
  const isNodeContext = (node: IndustryGraphNode | undefined) => node?.kind === "category" && interaction.focusedCategoryId !== null && isFocusAncestor(node.categoryId, interaction.focusedCategoryId);
  const matchesSignal = (edge: IndustryGraphPayload["edges"][number]) => {
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
  const edgeByEndpoints = new Map(graph.edges.map((edge) => [`${edge.source}->${edge.target}`, edge]));
  const isNodeVisibleForSignal = (node: IndustryGraphNode | undefined) => {
    if (!node || node.kind === "category" || interaction.signalFilter === "all") return true;
    return graph.edges.some((edge) => {
      if (edge.kind === "relation") return getRelationEndpoints(edge)?.companyNodeId === node.id && matchesSignal(edge);
      return (edge.kind === "entityRelation" || edge.kind === "evidenceLink") && edge.target === node.id && matchesSignal(edge);
    });
  };
  const setFocusCamera = () => {
    const focus = interaction.focusedCategoryId === null ? undefined : categoryById.get(interaction.focusedCategoryId);
    if (!focus) {
      targetGroupPosition.set(0, 0, 0);
      targetGroupScale = 1;
      targetCameraPosition.set(0, 10, 34);
      targetControlPosition.set(0, 0, 0);
      controls.autoRotate = quality.tier !== "reduced";
    } else {
      const center = new THREE.Vector3(...positions[focus.id]);
      targetGroupScale = Math.min(2.35, 1.45 + focus.level * 0.22);
      targetGroupPosition.copy(center).multiplyScalar(-targetGroupScale);
      targetCameraPosition.set(0, focus.level > 2 ? 3.5 : 5.5, focus.level > 2 ? 15 : 20);
      targetControlPosition.set(0, 0, 0);
      controls.autoRotate = false;
    }
    isTransitioning = true;
  };

  const applyState = () => {
    const pathNodes = new Set(interaction.highlightedPathNodeIds);
    meshById.forEach((mesh, id) => {
      const node = nodeById.get(id);
      const focused = isNodeInFocus(node) && isNodeVisibleForSignal(node);
      const contextual = isNodeContext(node);
      const inPath = pathNodes.has(id);
      const active = id === interaction.selectedNodeId || id === hoveredId || inPath;
      mesh.scale.setScalar(active ? inPath ? 1.38 : 1.55 : focused && node?.kind === "category" ? 1.12 : 1);
      const material = mesh.material as THREE.MeshPhysicalMaterial;
      material.opacity = focused ? 1 : contextual ? 0.3 : 0.07;
      material.emissiveIntensity = active ? inPath ? 0.45 : 0.65 : focused ? 0.2 : contextual ? 0.07 : 0.015;
      const glow = glowById.get(id);
      if (glow) {
        const glowMaterial = glow.material as THREE.SpriteMaterial;
        glowMaterial.opacity = active ? 0.52 : focused ? node?.kind === "category" ? 0.17 : 0.09 : contextual ? 0.04 : 0.008;
        const radius = node?.kind === "category" ? 1 : node?.kind === "entity" ? 0.7 : 0.52;
        glow.scale.setScalar(radius * (active ? 5.6 : focused ? 3.15 : 2.2));
      }
      const label = labelById.get(id);
      const focusLevel = interaction.focusedCategoryId === null ? -1 : categoryById.get(interaction.focusedCategoryId)?.level ?? -1;
      const showFocusCategory = node?.kind === "category" && focused && interaction.focusedCategoryId !== null && node.level <= focusLevel + 1;
      const showRootCategory = node?.kind === "category" && interaction.focusedCategoryId === null && node.level === 0;
      const showLabel = active || showFocusCategory || showRootCategory;
      label?.classList.toggle("is-muted", !focused && !contextual);
      label?.classList.toggle("is-quiet", !showLabel);
      label?.classList.toggle("is-active", active);
    });
    edgeVisuals.forEach((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      const signalMatches = matchesSignal(edgeByEndpoints.get(`${edge.source}->${edge.target}`) ?? { kind: "hierarchy", source: edge.source, target: edge.target, id: "", evidenceCount: 0 });
      const connected = signalMatches && isNodeInFocus(source) && isNodeInFocus(target);
      const contextual = (isNodeContext(source) && isNodeInFocus(target)) || (isNodeContext(target) && isNodeInFocus(source));
      const isPathEdge = pathNodes.has(edge.source) && pathNodes.has(edge.target);
      edge.material.opacity = isPathEdge ? 1 : connected ? edge.baseOpacity : contextual ? edge.baseOpacity * 0.42 : 0.025;
    });
    flowCurves.forEach((flow, edgeIndex) => {
      const edge = edgeByEndpoints.get(`${flow.source}->${flow.target}`);
      const isPathFlow = pathNodes.has(flow.source) && pathNodes.has(flow.target);
      const strength = isPathFlow ? 1.55 : edge && matchesSignal(edge) && isNodeInFocus(nodeById.get(flow.source)) && isNodeInFocus(nodeById.get(flow.target)) ? 1 : 0.055;
      for (let packetIndex = 0; packetIndex < flowPacketsPerEdge; packetIndex += 1) {
        const colorOffset = (edgeIndex * flowPacketsPerEdge + packetIndex) * 3;
        flowColors[colorOffset] = flow.color.r * strength;
        flowColors[colorOffset + 1] = flow.color.g * strength;
        flowColors[colorOffset + 2] = flow.color.b * strength;
      }
    });
    flowColorAttribute.needsUpdate = true;
  };

  const handlePointerMove = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    hoveredId = raycaster.intersectObjects(selectable, false)[0]?.object.userData.nodeId ?? null;
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    applyState();
  };
  const handleClick = () => {
    if (!hoveredId) return;
    const node = nodeById.get(hoveredId);
    if (node) onSelect(node);
  };
  const handleContextLost = (event: Event) => { event.preventDefault(); onFailure(); };
  const handleVisibility = () => { visible = !document.hidden; };
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("click", handleClick);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  document.addEventListener("visibilitychange", handleVisibility);

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const animate = () => {
    frame = requestAnimationFrame(animate);
    if (!visible) return;
    if (isTransitioning) {
      graphGroup.position.lerp(targetGroupPosition, 0.12);
      const nextScale = THREE.MathUtils.lerp(graphGroup.scale.x, targetGroupScale, 0.12);
      graphGroup.scale.setScalar(nextScale);
      camera.position.lerp(targetCameraPosition, 0.1);
      controls.target.lerp(targetControlPosition, 0.12);
      if (graphGroup.position.distanceToSquared(targetGroupPosition) < 0.0001 && Math.abs(nextScale - targetGroupScale) < 0.001 && camera.position.distanceToSquared(targetCameraPosition) < 0.0001) isTransitioning = false;
    }
    const elapsed = clock.getElapsedTime();
    if (isRevealing) {
      graphGroup.rotation.z = THREE.MathUtils.lerp(graphGroup.rotation.z, 0, 0.055);
      if (Math.abs(graphGroup.rotation.z) < 0.001 && graphGroup.scale.x > 0.985) isRevealing = false;
    }
    clusterDust.points.rotation.y = elapsed * 0.012;
    clusterDust.points.rotation.z = Math.sin(elapsed * 0.1) * 0.025;
    glowById.forEach((glow, id) => {
      const active = id === interaction.selectedNodeId || id === hoveredId || interaction.highlightedPathNodeIds.includes(id);
      glow.material.rotation = active ? elapsed * 0.38 : -elapsed * 0.08;
    });
    flowCurves.forEach((flow, edgeIndex) => {
      for (let packetIndex = 0; packetIndex < flowPacketsPerEdge; packetIndex += 1) {
        const index = edgeIndex * flowPacketsPerEdge + packetIndex;
        const progress = (flow.phase + elapsed * flow.speed + packetIndex / flowPacketsPerEdge) % 1;
        const point = flow.curve.getPoint(progress);
        flowPositions[index * 3] = point.x;
        flowPositions[index * 3 + 1] = point.y;
        flowPositions[index * 3 + 2] = point.z;
      }
    });
    const flowPositionAttribute = flowGeometry.getAttribute("position") as THREE.BufferAttribute;
    flowPositionAttribute.needsUpdate = true;
    controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  animate();

  return {
    setInteractionState(next) { interaction = next; setFocusCamera(); applyState(); },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", handleVisibility);
      controls.dispose();
      composer?.dispose();
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      labelRenderer.domElement.remove();
      renderer.domElement.remove();
    },
  };
}

function relationColor(relationType: string) {
  if (relationType === "主营业务") return 0xa9c5ff;
  if (relationType === "待验证") return 0xff8daf;
  if (relationType === "核心产品" || relationType === "技术关联") return 0xc5a7ff;
  if (relationType === "项目进展" || relationType === "政策催化") return 0x8fe3d0;
  if (relationType === "风险传导") return 0xff789b;
  return 0xf1d08a;
}

function entityColor(entityType: string) {
  if (entityType === "产品/技术") return 0xc5a7ff;
  if (entityType === "客户/供应商") return 0xf1d08a;
  if (entityType === "项目/产能") return 0xa9c5ff;
  return 0x8fe3d0;
}

function clusterColor(index: number) {
  return [0xb8c8ff, 0xf0d18b, 0xc6a7ff, 0x93e2d2, 0xf29ab5, 0x8fa7d9][index % 6];
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.1, "rgba(238,242,255,.96)");
  gradient.addColorStop(0.34, "rgba(180,198,255,.38)");
  gradient.addColorStop(1, "rgba(146,168,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createClusterDust({
  graph,
  positions,
  nodeRootIds,
  rootCategories,
  quality,
}: {
  graph: IndustryGraphPayload;
  positions: Record<string, GraphPosition>;
  nodeRootIds: Map<string, number>;
  rootCategories: Array<Extract<IndustryGraphNode, { kind: "category" }>>;
  quality: GraphQuality;
}) {
  const dustPerNode = quality.tier === "full" ? 15 : quality.tier === "balanced" ? 8 : 4;
  const nodes = graph.nodes.filter((node) => positions[node.id]);
  const count = nodes.length * dustPerNode;
  const dustPositions = new Float32Array(count * 3);
  const dustColors = new Float32Array(count * 3);
  const rootIndex = new Map(rootCategories.map((category, index) => [category.categoryId, index]));

  nodes.forEach((node, nodeIndex) => {
    const center = positions[node.id];
    const root = nodeRootIds.get(node.id);
    const color = new THREE.Color(clusterColor(rootIndex.get(root ?? -1) ?? nodeIndex));
    const spread = node.kind === "category" ? 1.7 : node.kind === "entity" ? 0.92 : 0.65;
    for (let pointIndex = 0; pointIndex < dustPerNode; pointIndex += 1) {
      const index = nodeIndex * dustPerNode + pointIndex;
      const angle = seededNoise(node.layoutSeed * 37 + pointIndex * 11) * Math.PI * 2;
      const radial = spread * (0.12 + seededNoise(node.layoutSeed + pointIndex * 23) * seededNoise(nodeIndex + pointIndex * 7));
      dustPositions[index * 3] = center[0] + Math.cos(angle) * radial;
      dustPositions[index * 3 + 1] = center[1] + (seededNoise(pointIndex * 13 + node.layoutSeed) - 0.5) * spread * 0.86;
      dustPositions[index * 3 + 2] = center[2] + Math.sin(angle) * radial;
      color.toArray(dustColors, index * 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const material = new THREE.PointsMaterial({
    size: quality.tier === "full" ? 0.065 : 0.052,
    transparent: true,
    opacity: 0.46,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { geometry, material, points };
}

function seededNoise(seed: number) {
  return ((Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0) % 10_000) / 10_000;
}
