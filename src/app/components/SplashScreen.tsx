"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Stars, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

const GREEN = "#34a853";
const GREEN_LIGHT = "#7bd88f";
const FONT = "/fonts/space-grotesk-700.woff";

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function Scene() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cp = easeOutExpo(Math.min(t / 2.2, 1));
    state.camera.position.set(0, 0.5 * (1 - cp), 3 + cp * 4.5);
    state.camera.lookAt(0, 0, 0);

    if (!groupRef.current) return;

    const sp = easeOutExpo(Math.min(t / 1, 1));
    const breathe = t > 1.3 ? 1 + Math.sin(t * 0.85) * 0.012 : 1;
    groupRef.current.scale.setScalar((0.04 + sp * 0.96) * breathe);
    groupRef.current.rotation.y = Math.sin(t * 0.28) * 0.05;
    groupRef.current.rotation.x = Math.cos(t * 0.19) * 0.014;
  });

  return (
    <>
      <group ref={groupRef}>
        <Text
          anchorX="right"
          anchorY="middle"
          color={GREEN}
          fillOpacity={0.45}
          font={FONT}
          fontSize={1.8}
          position={[-0.05, 0, 0]}
        >
          Ad
        </Text>
        <Text
          anchorX="left"
          anchorY="middle"
          color={GREEN}
          fillOpacity={1}
          font={FONT}
          fontSize={1.8}
          position={[0.05, 0, 0]}
        >
          Stylr
        </Text>
      </group>

      <Sparkles
        color={GREEN}
        count={110}
        noise={0.7}
        opacity={0.55}
        scale={[22, 12, 10]}
        size={new Float32Array([0.4, 0.6, 1.2, 2, 3, 4, 6, 5, 2.5, 1])}
        speed={0.4}
      />
      <Stars count={1600} depth={60} factor={2.4} fade radius={80} saturation={0} speed={0.18} />

      <ambientLight intensity={0.03} />
      <pointLight color={GREEN} intensity={7} position={[0, 0, 10]} />
      <pointLight color="#ffffff" intensity={1.4} position={[-9, 5, 5]} />
      <pointLight color={GREEN_LIGHT} intensity={0.8} position={[9, -4, 5]} />
    </>
  );
}

export default function SplashScreen({ onComplete }: { onComplete?: () => void }) {
  const [phase, setPhase] = useState<"in" | "show" | "out">("in");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("show"));

    if (!onComplete) {
      return () => cancelAnimationFrame(raf);
    }

    const t1 = setTimeout(() => setPhase("out"), 3400);
    const t2 = setTimeout(onComplete, 4100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <div
      style={{
        background: "#040a06",
        inset: 0,
        opacity: phase === "show" ? 1 : 0,
        pointerEvents: phase === "out" ? "none" : "all",
        position: "fixed",
        transition: "opacity 0.75s ease",
        zIndex: 9999,
      }}
    >
      <Canvas camera={{ fov: 42, position: [0, 0.5, 3] }} dpr={[1, 2]} gl={{ alpha: false, antialias: true }}>
        <color args={["#040a06"]} attach="background" />
        <Scene />
        <EffectComposer>
          <Bloom intensity={2.2} luminanceSmoothing={0.75} luminanceThreshold={0.05} mipmapBlur radius={1} />
          <Vignette darkness={1.35} offset={0.12} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
