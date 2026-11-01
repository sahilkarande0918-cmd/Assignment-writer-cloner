"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Ruled notebook texture drawn once on a canvas (no external assets).
function usePaperTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 724;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fffdf9";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#bfd2e4";
    g.lineWidth = 2;
    for (let y = 90; y < c.height - 30; y += 30) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(c.width, y);
      g.stroke();
    }
    g.strokeStyle = "#dd9a9a";
    g.beginPath();
    g.moveTo(70, 0);
    g.lineTo(70, c.height);
    g.stroke();
    // Abstract "ink" strokes: suggestion of writing, not text.
    g.strokeStyle = "#2b3a55";
    g.lineWidth = 2.4;
    g.lineCap = "round";
    for (let line = 0; line < 14; line++) {
      const y = 82 + line * 30;
      let x = 84;
      const end = 200 + ((line * 97) % 260);
      g.beginPath();
      g.moveTo(x, y);
      while (x < end) {
        x += 6;
        g.lineTo(x, y - 6 - Math.abs(Math.sin(x * 0.35 + line)) * 9);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
}

const SHEETS = [
  { p: [1.1, 0.35, -0.6], r: [0.06, -0.42, 0.06], s: 1.05 },
  { p: [3.0, -0.25, -1.4], r: [-0.05, -0.6, -0.08], s: 0.95 },
  { p: [2.1, 1.3, -3.2], r: [0.15, -0.3, 0.14], s: 0.8 },
  { p: [4.2, 1.0, -3.8], r: [-0.12, -0.7, 0.2], s: 0.75 },
] as const;

function Sheets() {
  const group = useRef<THREE.Group>(null);
  const texture = usePaperTexture();
  useFrame(({ clock, pointer }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, pointer.x * 0.12, 0.03);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -pointer.y * 0.08, 0.03);
    g.children.forEach((m, i) => {
      m.position.y = SHEETS[i].p[1] + Math.sin(t * 0.4 + i * 1.7) * 0.12;
    });
  });
  return (
    <group ref={group}>
      {SHEETS.map((s, i) => (
        <mesh key={i} position={[...s.p]} rotation={[...s.r]} scale={s.s}>
          <planeGeometry args={[2.1, 2.97]} />
          <meshStandardMaterial map={texture} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <Sheets />
    </Canvas>
  );
}
