/* CRYORADAR — Three.js 3D Mars Viewer
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Renders Mars surface terrain with subsurface radargram
 * cross-section and optional clutter overlay using Three.js.
 * Lazy-loaded via React.lazy() for bundle optimization. */

import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useCryoState } from '../../context/CryoRadarContext';
import { buildMarsTerrainMesh } from '../../core/three/mars-surface';
import { buildRadargramSliceMesh } from '../../core/three/radargram-slice';
import { buildClutterOverlayMesh } from '../../core/three/clutter-model';

export function ThreeViewer() {
  const { dataset, colormap, contrastMin, contrastMax, showClutter, operatingFrequencyMhz } = useCryoState();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef(0);

  const buildScene = useCallback(() => {
    if (!containerRef.current || !dataset) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    if (sceneRef.current) {
      sceneRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.3);

    const ambientLight = new THREE.AmbientLight(0x8899aa, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    sunLight.position.set(3, 4, 2);
    sunLight.castShadow = false;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x334466, 0.3);
    fillLight.position.set(-2, 1, -3);
    scene.add(fillLight);

    const terrain = buildMarsTerrainMesh(dataset.geometry, dataset.radargram.width);
    scene.add(terrain);

    const slice = buildRadargramSliceMesh(dataset.radargram, colormap, contrastMin, contrastMax);
    scene.add(slice);

    if (showClutter) {
      const clutterMesh = buildClutterOverlayMesh(
        dataset.geometry, operatingFrequencyMhz, dataset.radargram.width
      );
      scene.add(clutterMesh);
    }

    const gridHelper = new THREE.GridHelper(6, 20, 0x1a2744, 0x111a2e);
    gridHelper.position.y = -0.62;
    scene.add(gridHelper);

    if (!rendererRef.current) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(rect.width, rect.height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } else {
      rendererRef.current.setSize(rect.width, rect.height);
    }

    if (!cameraRef.current) {
      const camera = new THREE.PerspectiveCamera(55, rect.width / rect.height, 0.01, 100);
      camera.position.set(2.5, 1.5, 2.5);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;
    } else {
      cameraRef.current.aspect = rect.width / rect.height;
      cameraRef.current.updateProjectionMatrix();
    }

    if (controlsRef.current) controlsRef.current.dispose();
    const controls = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.85;
    controlsRef.current = controls;

    sceneRef.current = scene;
  }, [dataset, colormap, contrastMin, contrastMax, showClutter, operatingFrequencyMhz]);

  useEffect(() => {
    buildScene();

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controlsRef.current?.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [buildScene]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onResize = () => {
      const rect = container.getBoundingClientRect();
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.setSize(rect.width, rect.height);
        cameraRef.current.aspect = rect.width / rect.height;
        cameraRef.current.updateProjectionMatrix();
      }
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current?.domElement.remove();
      rendererRef.current = null;
      controlsRef.current?.dispose();
      controlsRef.current = null;
    };
  }, []);

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <span className="text-4xl">🌐</span>
        <p className="text-sm">Load a dataset to view 3D visualization</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 text-[10px] font-mono text-gray-500 bg-space-900/80 backdrop-blur-sm rounded-lg p-2 border border-space-700">
        <span className="text-neon-cyan font-semibold">3D SUBSURFACE VIEW</span>
        <span>🏔️ MOLA Terrain</span>
        <span>📊 Radar Cross-Section</span>
        {showClutter && <span className="text-neon-orange">⚡ Clutter Overlay</span>}
        <span className="text-gray-600 text-[9px]">Drag to orbit · Scroll to zoom</span>
      </div>
    </div>
  );
}

export default ThreeViewer;
