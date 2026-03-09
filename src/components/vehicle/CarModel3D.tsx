import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useVehicleStore } from '@/lib/store';
import * as THREE from 'three';
import { Html, Text, RoundedBox } from '@react-three/drei';

type CarModel3DProps = {
    isFrontDefrosterActive?: boolean;
    isRearDefrosterActive?: boolean;
};

export function CarModel3D({ isFrontDefrosterActive = false, isRearDefrosterActive = false }: CarModel3DProps) {
    // -------------------------------------------------------------
    // 【Store (状態管理) からのデータ取得】
    // -------------------------------------------------------------
    const wFL = useVehicleStore(s => s["Vehicle.Cabin.Door.Row1.Left.Window.Position"]);
    const wFR = useVehicleStore(s => s["Vehicle.Cabin.Door.Row1.Right.Window.Position"]);
    const wRL = useVehicleStore(s => s["Vehicle.Cabin.Door.Row2.Left.Window.Position"]);
    const wRR = useVehicleStore(s => s["Vehicle.Cabin.Door.Row2.Right.Window.Position"]);

    const wiperMode = useVehicleStore(s => s["Vehicle.Body.Windshield.Wiper.Mode"]);
    const rainLevel = useVehicleStore(s => s["Vehicle.Exterior.Air.RainIntensity"]);

    const hazard = useVehicleStore(s => s["Vehicle.Body.Lights.Hazard.IsSignaling"]);
    const leftSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"]);
    const rightSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"]);
    const blinkerTick = useVehicleStore(s => s["Internal.BlinkerTick"]);

    // -------------------------------------------------------------
    // 【アニメーション用のRef】
    // -------------------------------------------------------------
    const wiperLeftArmRef = useRef<THREE.Group>(null);
    const wiperRightArmRef = useRef<THREE.Group>(null);

    const frontDefrosterRef1 = useRef<THREE.Group>(null);
    const frontDefrosterRef2 = useRef<THREE.Group>(null);
    const frontDefrosterRef3 = useRef<THREE.Group>(null);

    const frontLeftLight = useRef<THREE.MeshStandardMaterial>(null);
    const frontRightLight = useRef<THREE.MeshStandardMaterial>(null);
    const rearLeftLight = useRef<THREE.MeshStandardMaterial>(null);
    const rearRightLight = useRef<THREE.MeshStandardMaterial>(null);
    const sideLeftLight = useRef<THREE.MeshStandardMaterial>(null);
    const sideRightLight = useRef<THREE.MeshStandardMaterial>(null);

    // -------------------------------------------------------------
    // 【サイズ・構造定義】
    // -------------------------------------------------------------
    const bodyW = 2.0;
    const bodyH = 0.7;
    const bodyD = 4.8;

    const roofY = bodyH + 0.7;

    const zBumperF = bodyD / 2;
    const zBaseF = 0.8;
    const zRoofF = 0.0;
    const zRoofR = -1.0;
    const zBaseR = -2.0;
    const zBumperR = -bodyD / 2;

    const frontGlassDX = zBaseF - zRoofF;
    const frontGlassDY = roofY - bodyH;
    const frontGlassAngle = Math.atan2(frontGlassDX, frontGlassDY);
    const frontGlassLength = Math.hypot(frontGlassDX, frontGlassDY);

    const rearGlassDX = zRoofR - zBaseR;
    const rearGlassDY = roofY - bodyH;
    const rearGlassAngle = Math.atan2(rearGlassDX, rearGlassDY);
    const rearGlassLength = Math.hypot(rearGlassDX, rearGlassDY);

    const paintColor = "#288e73";

    const isLightsOn = rainLevel >= 50;

    const getWinOffsetY = (pos: number) => -0.7 * (pos / 100);

    // 【サイドガラスのダイヤゴナル・カット形状作成】
    const fwShape = useMemo(() => {
        const s = new THREE.Shape();
        s.moveTo(-0.48, 0); // Bピラー内側
        s.lineTo(0.78, 0);  // Aピラー沿い
        s.lineTo(-0.02, 0.7);
        s.lineTo(-0.48, 0.7);
        return s;
    }, []);

    const rwShape = useMemo(() => {
        const s = new THREE.Shape();
        s.moveTo(-1.98, 0); // Cピラー沿い
        s.lineTo(-0.52, 0); // Bピラー内側
        s.lineTo(-0.52, 0.7);
        s.lineTo(-0.98, 0.7);
        return s;
    }, []);

    const extrudeSettings = { depth: 0.02, bevelEnabled: false };

    // -------------------------------------------------------------
    // 【アニメーション (useFrame)】
    // -------------------------------------------------------------
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();

        // 1. ウインカーの点滅
        const isLeftBlinking = (leftSig || hazard) && blinkerTick;
        const isRightBlinking = (rightSig || hazard) && blinkerTick;

        const blinkerOnColor = 0xff6600;
        const blinkerOffColor = 0x554433;
        const emissiveOnIntensity = 5.0;

        [frontLeftLight, rearLeftLight, sideLeftLight].forEach(ref => {
            if (ref.current) {
                ref.current.emissiveIntensity = isLeftBlinking ? emissiveOnIntensity : 0;
                ref.current.color.setHex(isLeftBlinking ? blinkerOnColor : blinkerOffColor);
                if (isLeftBlinking) ref.current.emissive.setHex(blinkerOnColor);
            }
        });

        [frontRightLight, rearRightLight, sideRightLight].forEach(ref => {
            if (ref.current) {
                ref.current.emissiveIntensity = isRightBlinking ? emissiveOnIntensity : 0;
                ref.current.color.setHex(isRightBlinking ? blinkerOnColor : blinkerOffColor);
                if (isRightBlinking) ref.current.emissive.setHex(blinkerOnColor);
            }
        });

        // 2. ワイパー
        let speed = 0;
        switch (wiperMode) {
            case 'INT': speed = 0.5; break;
            case 'LO': speed = 1.0; break;
            case 'HI': speed = 2.0; break;
            case 'AUTO': speed = rainLevel > 0 ? Math.max(0.5, rainLevel / 20) : 0; break;
        }

        let angle = 0;
        if (speed > 0) {
            angle = Math.abs(Math.sin(t * Math.PI * speed)) * (Math.PI / 2.2);
        }

        if (wiperLeftArmRef.current) wiperLeftArmRef.current.rotation.z = angle - Math.PI / 2 + 0.1;
        if (wiperRightArmRef.current) wiperRightArmRef.current.rotation.z = angle - Math.PI / 2 + 0.1;

        // 3. デフロスタ矢印アニメーション
        if (isFrontDefrosterActive) {
            const animateDefroster = (ref: React.RefObject<THREE.Group | null>, offset: number) => {
                if (!ref.current) return;
                const modTime = (t * 1.5 + offset) % 1;

                const startY = -frontGlassLength / 2 + 0.1;
                const endY = frontGlassLength / 2 - 0.1;
                ref.current.position.y = startY + (modTime * (endY - startY));

                const opacityVal = Math.sin(modTime * Math.PI) * 0.9;
                ref.current.children.forEach(arrowGroup => {
                    arrowGroup.children.forEach((mesh: any) => {
                        if (mesh.material) {
                            mesh.material.opacity = opacityVal;
                            mesh.material.transparent = true;
                            mesh.material.depthTest = false;
                        }
                    });
                });
            };
            animateDefroster(frontDefrosterRef1, 0.0);
            animateDefroster(frontDefrosterRef2, 0.33);
            animateDefroster(frontDefrosterRef3, 0.66);
        }
    });

    return (
        <group position={[0, 0.2, 0]}>
            {/* 
              -------------------------------------------------------------
              [ 車体ベース (Lower Body) ]
              箱型 (boxGeometry) ではなく、RoundedBox を使用することで角を滑らかにし、
              モダンで柔らかな曲線基調のカーデザインを表現しています。
              radius=0.15 により、バンパー周りにより強い丸みを持たせています。
              -------------------------------------------------------------
            */}
            <RoundedBox position={[0, bodyH / 2, 0]} args={[bodyW, bodyH, bodyD]} radius={0.15} smoothness={4} castShadow receiveShadow>
                {/* 
                  [ 塗装の質感 (meshPhysicalMaterial) ]
                  ただの塗料ではなく「車のクリア塗装」を再現するため、以下のパラメータを設定しています。
                  - metalness (0.7) / roughness (0.15) : ベースとなる金属＋塗装の反射と滑らかさ
                  - clearcoat (1.0) / clearcoatRoughness (0.1) : 表面の透明な艶と、ハイライトの鋭さ
                */}
                <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
            </RoundedBox>

            {/* [ フロントバンパー下部 ] 段差をつけて立体感を出す */}
            <RoundedBox position={[0, bodyH / 2 + 0.1, zBaseF + (zBumperF - zBaseF) / 2]} rotation={[0.08, 0, 0]} args={[bodyW - 0.05, 0.5, zBumperF - zBaseF]} radius={0.1} smoothness={4} castShadow receiveShadow>
                <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
            </RoundedBox>

            {/* [ リアバンパー下部 ] */}
            <RoundedBox position={[0, bodyH / 2 + 0.1, zBumperR + Math.abs(zBaseR - zBumperR) / 2]} rotation={[-0.05, 0, 0]} args={[bodyW - 0.05, 0.5, Math.abs(zBaseR - zBumperR)]} radius={0.1} smoothness={4} castShadow receiveShadow>
                <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
            </RoundedBox>

            {/* 
              -------------------------------------------------------------
              [ Roof & Pillars (ルーフと各ピラー) ]
              細いパーツのため、控えめなカーブ (radius: 0.02) でエッジの鋭さだけを和らげています。
              -------------------------------------------------------------
            */}
            <RoundedBox position={[0, roofY, (zRoofF + zRoofR) / 2]} args={[bodyW - 0.2, 0.05, Math.abs(zRoofF - zRoofR)]} radius={0.02} smoothness={2} castShadow receiveShadow>
                <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
            </RoundedBox>

            {/* A Pillars */}
            {[1, -1].map((sign, idx) => (
                <RoundedBox key={`a-pillar-${idx}`} position={[sign * (bodyW / 2 - 0.15), bodyH + frontGlassDY / 2, zRoofF + frontGlassDX / 2]} rotation={[-frontGlassAngle, 0, 0]} args={[0.1, frontGlassLength, 0.1]} radius={0.02} smoothness={2} castShadow>
                    <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
                </RoundedBox>
            ))}

            {/* C Pillars (Aピラーと同じ太さ 0.1 に修正) */}
            {[1, -1].map((sign, idx) => (
                <RoundedBox key={`c-pillar-real-${idx}`} position={[sign * (bodyW / 2 - 0.15), bodyH + rearGlassDY / 2, zBaseR + rearGlassDX / 2]} rotation={[rearGlassAngle, 0, 0]} args={[0.1, rearGlassLength, 0.1]} radius={0.02} smoothness={2} castShadow>
                    <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
                </RoundedBox>
            ))}

            {/* B Pillars */}
            {[1, -1].map((sign, idx) => (
                <RoundedBox key={`b-pillar-mid-${idx}`} position={[sign * (bodyW / 2 - 0.15), bodyH + rearGlassDY / 2, (zRoofF + zRoofR) / 2]} args={[0.1, rearGlassDY, 0.2]} radius={0.02} smoothness={2} castShadow>
                    <meshPhysicalMaterial color={paintColor} metalness={0.7} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} />
                </RoundedBox>
            ))}

            {/* 
              -------------------------------------------------------------
              [ Front Windshield (フロントガラス) ]
              ガラス特有の透明度 (transmission) と屈折率 (ior=1.5) を物理ベースで設定しています。
              エッジをわずかに丸め (radius: 0.01) 、ボディとの一体感を高めています。
              -------------------------------------------------------------
            */}
            <group position={[0, bodyH + frontGlassDY / 2, zRoofF + frontGlassDX / 2]} rotation={[-frontGlassAngle, 0, 0]}>
                <RoundedBox args={[bodyW - 0.3, frontGlassLength, 0.03]} radius={0.01} smoothness={2}>
                    <meshPhysicalMaterial color="#aaccff" transmission={0.95} opacity={1} transparent roughness={0} clearcoat={1.0} clearcoatRoughness={0} ior={1.5} thickness={0.03} />
                </RoundedBox>

                {isFrontDefrosterActive && (
                    <group position={[0, 0, 0]}>
                        {[frontDefrosterRef1, frontDefrosterRef2, frontDefrosterRef3].map((ref, idx) => (
                            <group key={idx} ref={ref}>
                                {[-0.5, 0, 0.5].map((xPos, aIdx) => (
                                    <group key={`arr-${aIdx}`} position={[xPos, 0, 0]}>
                                        <mesh position={[0, 0, 0]}>
                                            <cylinderGeometry args={[0.02, 0.02, 0.3]} />
                                            <meshBasicMaterial color="#ff0000" />
                                        </mesh>
                                        <mesh position={[0, 0.15, 0]}>
                                            <coneGeometry args={[0.1, 0.15, 8]} />
                                            <meshBasicMaterial color="#ff0000" />
                                        </mesh>
                                    </group>
                                ))}
                            </group>
                        ))}
                    </group>
                )}
            </group>

            {/* 
              -------------------------------------------------------------
              [ Rear Window (リアガラス) ]
              フロント同様の物理マテリアルに加え、内部にデフォッガ（熱線）のギミックを含みます。
              -------------------------------------------------------------
            */}
            <group position={[0, bodyH + rearGlassDY / 2, zBaseR + rearGlassDX / 2]} rotation={[rearGlassAngle, 0, 0]}>
                <RoundedBox args={[bodyW - 0.3, rearGlassLength, 0.03]} radius={0.01} smoothness={2}>
                    <meshPhysicalMaterial color="#aaccff" transmission={0.95} opacity={1} transparent roughness={0} clearcoat={1.0} clearcoatRoughness={0} ior={1.5} thickness={0.03} />
                </RoundedBox>

                <group position={[0, 0, -0.02]}>
                    {/* リアガラス熱線（5本線）の表現: 非作動時は黒色、作動時は赤色で強く光る */}
                    {[-0.3, -0.15, 0, 0.15, 0.3].map((yOffset, idx) => (
                        <mesh key={`def-${idx}`} position={[0, yOffset, 0]}>
                            <boxGeometry args={[bodyW - 0.4, 0.015, 0.01]} />
                            <meshStandardMaterial
                                color={isRearDefrosterActive ? "#ff0000" : "#000000"}
                                emissive={isRearDefrosterActive ? "#ff0000" : "#000000"}
                                emissiveIntensity={isRearDefrosterActive ? 3.0 : 0}
                            />
                        </mesh>
                    ))}
                </group>
            </group>

            {/* --- Side Windows (ピラーの傾斜に合わせてカットされた形状、ドアの内部に沈む) --- */}
            <group position={[0, 0, 0]}>
                {/* Front Side Windows */}
                {[1, -1].map((sign, idx) => {
                    const wPos = sign > 0 ? wFL : wFR;
                    return (
                        <group key={`f-win-grp-${idx}`} position={[sign * (bodyW / 2 - 0.08), bodyH + getWinOffsetY(wPos), 0]} rotation={[0, -Math.PI / 2, 0]}>
                            <mesh position={[0, 0, sign > 0 ? 0 : -0.02]}>
                                <extrudeGeometry args={[fwShape, extrudeSettings]} />
                                <meshPhysicalMaterial color="#aaccff" transmission={0.95} opacity={1} transparent roughness={0} clearcoat={1.0} clearcoatRoughness={0} ior={1.5} />
                            </mesh>
                        </group>
                    )
                })}
                {/* Rear Side Windows */}
                {[1, -1].map((sign, idx) => {
                    const wPos = sign > 0 ? wRL : wRR;
                    return (
                        <group key={`r-win-grp-${idx}`} position={[sign * (bodyW / 2 - 0.08), bodyH + getWinOffsetY(wPos), 0]} rotation={[0, -Math.PI / 2, 0]}>
                            <mesh position={[0, 0, sign > 0 ? 0 : -0.02]}>
                                <extrudeGeometry args={[rwShape, extrudeSettings]} />
                                <meshPhysicalMaterial color="#aaccff" transmission={0.95} opacity={1} transparent roughness={0} clearcoat={1.0} clearcoatRoughness={0} ior={1.5} />
                            </mesh>
                        </group>
                    )
                })}
            </group>

            {/* 
              -------------------------------------------------------------
              [ Wipers (ワイパー) ]
              クルマの右側(X=-0.45)に右ワイパー(RightArmRef)、中央(X=0.0)に左ワイパー(LeftArmRef)を配置。
              完全に真っ黒な色から、わずかに反射(roughness:0.7, metalness:0.2)を持たせることで
              プラスチック/樹脂パーツらしいリアルな質感を持たせています。
              -------------------------------------------------------------
            */}
            <group position={[0, bodyH + 0.02, zBaseF + 0.05]} rotation={[-frontGlassAngle, 0, 0]}>
                <group position={[0.0, 0, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.08]} />
                        <meshStandardMaterial color="#1a1a1a" roughness={0.7} metalness={0.2} />
                    </mesh>
                    <group ref={wiperLeftArmRef} position={[0, 0, 0]}>
                        <mesh position={[0, 0.38, 0]}>
                            <boxGeometry args={[0.025, 0.76, 0.015]} />
                            <meshStandardMaterial color="#151515" roughness={0.7} metalness={0.2} />
                        </mesh>
                    </group>
                </group>
                <group position={[-0.45, 0, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.08]} />
                        <meshStandardMaterial color="#1a1a1a" roughness={0.7} metalness={0.2} />
                    </mesh>
                    <group ref={wiperRightArmRef} position={[0, 0, 0]}>
                        <mesh position={[0, 0.42, 0]}>
                            <boxGeometry args={[0.025, 0.84, 0.015]} />
                            <meshStandardMaterial color="#151515" roughness={0.7} metalness={0.2} />
                        </mesh>
                    </group>
                </group>
            </group>

            {/* 
              -------------------------------------------------------------
              [ Wheels & Tires (タイヤとホイール) ]
              -------------------------------------------------------------
            */}
            {[
                [bodyW / 2, -0.1, bodyD / 2 - 0.8],
                [-bodyW / 2, -0.1, bodyD / 2 - 0.8],
                [bodyW / 2, -0.1, -bodyD / 2 + 0.8],
                [-bodyW / 2, -0.1, -bodyD / 2 + 0.8],
            ].map((pos, idx) => (
                <group key={idx} position={pos as [number, number, number]} rotation={[0, 0, pos[0] > 0 ? -Math.PI / 2 : Math.PI / 2]}>
                    {/* 
                      [ タイヤのゴム部分 ]
                      color="#151515" により、漆黒ではなく実際のカーボンブラックに近い色を表現。
                      roughness=0.8, metalness=0.1 により、ゴム特有の鈍い光の反射を持たせています。
                    */}
                    <mesh castShadow>
                        <cylinderGeometry args={[0.45, 0.45, 0.35, 32]} />
                        <meshStandardMaterial color="#151515" roughness={0.8} metalness={0.1} />
                    </mesh>
                    {/* [ ホイールベース (リム) ] 金属質な反射を設定 */}
                    <mesh position={[0, 0.18, 0]}>
                        <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
                        <meshStandardMaterial color="#d0d0d0" metalness={1.0} roughness={0.15} />
                    </mesh>
                    {/* ホイールのスポーク(6本) */}
                    {[0, Math.PI / 3, Math.PI * 2 / 3].map((ang, i) => (
                        <mesh key={`spoke-${i}`} position={[0, 0.19, 0]} rotation={[0, ang, 0]}>
                            <boxGeometry args={[0.58, 0.02, 0.06]} />
                            <meshStandardMaterial color="#e0e0e0" metalness={1.0} roughness={0.1} />
                        </mesh>
                    ))}
                    {/* センターキャップ */}
                    <mesh position={[0, 0.20, 0]}>
                        <cylinderGeometry args={[0.08, 0.08, 0.015, 16]} />
                        <meshStandardMaterial color="#ffffff" metalness={1.0} roughness={0.1} />
                    </mesh>
                </group>
            ))}

            {/* 
              -------------------------------------------------------------
              [ Front Grille (フロントグリル) & ロゴ ]
              ワイパー同様、樹脂らしい微かに艶のある黒色（#151515）に設定しています。
              -------------------------------------------------------------
            */}
            <mesh position={[0, bodyH / 2 + 0.2, bodyD / 2 + 0.01]}>
                <boxGeometry args={[0.8, 0.25, 0.03]} />
                <meshStandardMaterial color="#151515" roughness={0.7} metalness={0.2} />
            </mesh>
            <Text position={[0, bodyH / 2 + 0.2, bodyD / 2 + 0.03]} fontSize={0.15} color="#ffffff" anchorX="center" anchorY="middle">NCES</Text>

            {/* 
              -------------------------------------------------------------
              [ Headlights (ヘッドライト) ]
              storeのrainLevel(雨量)が50以上のとき(`isLightsOn`)、
              emissive(自己発光)が有効になり、自動で点灯するスマート機能と連動しています。
              -------------------------------------------------------------
            */}
            <mesh position={[bodyW / 2 - 0.35, bodyH / 2 + 0.2, bodyD / 2 - 0.01]}>
                <boxGeometry args={[0.4, 0.25, 0.05]} />
                <meshStandardMaterial color={isLightsOn ? "#ffffff" : "#444455"} emissive="#ffffff" emissiveIntensity={isLightsOn ? 1.5 : 0} />
            </mesh>
            <mesh position={[-bodyW / 2 + 0.35, bodyH / 2 + 0.2, bodyD / 2 - 0.01]}>
                <boxGeometry args={[0.4, 0.25, 0.05]} />
                <meshStandardMaterial color={isLightsOn ? "#ffffff" : "#444455"} emissive="#ffffff" emissiveIntensity={isLightsOn ? 1.5 : 0} />
            </mesh>

            {/* 2. フロントウインカー */}
            <mesh position={[bodyW / 2 - 0.35, bodyH / 2 - 0.05, bodyD / 2 + 0.01]}>
                <boxGeometry args={[0.4, 0.08, 0.05]} />
                <meshStandardMaterial ref={frontLeftLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>
            <mesh position={[-bodyW / 2 + 0.35, bodyH / 2 - 0.05, bodyD / 2 + 0.01]}>
                <boxGeometry args={[0.4, 0.08, 0.05]} />
                <meshStandardMaterial ref={frontRightLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>

            {/* テールランプ (ストップランプ相当) - 幅を狭くし、雨点灯に連動 */}
            <mesh position={[bodyW / 2 - 0.3, bodyH / 2 + 0.1, -bodyD / 2 - 0.01]}>
                <boxGeometry args={[0.5, 0.15, 0.05]} />
                <meshStandardMaterial color={isLightsOn ? "#ff0000" : "#440000"} emissive="#ff0000" emissiveIntensity={isLightsOn ? 2.0 : 0} />
            </mesh>
            <mesh position={[-bodyW / 2 + 0.3, bodyH / 2 + 0.1, -bodyD / 2 - 0.01]}>
                <boxGeometry args={[0.5, 0.15, 0.05]} />
                <meshStandardMaterial color={isLightsOn ? "#ff0000" : "#440000"} emissive="#ff0000" emissiveIntensity={isLightsOn ? 2.0 : 0} />
            </mesh>

            {/* 3. リアウインカー (テールランプの下に配置) */}
            <mesh position={[bodyW / 2 - 0.3, bodyH / 2 - 0.1, -bodyD / 2 - 0.015]}>
                <boxGeometry args={[0.5, 0.08, 0.05]} />
                <meshStandardMaterial ref={rearLeftLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>
            <mesh position={[-bodyW / 2 + 0.3, bodyH / 2 - 0.1, -bodyD / 2 - 0.015]}>
                <boxGeometry args={[0.5, 0.08, 0.05]} />
                <meshStandardMaterial ref={rearRightLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>

            {/* 4. サイドウインカー (フェンダー側面・フロントタイヤ上部) */}
            <mesh position={[bodyW / 2 + 0.01, bodyH / 2 + 0.1, bodyD / 2 - 0.8]}>
                <boxGeometry args={[0.05, 0.1, 0.2]} />
                <meshStandardMaterial ref={sideLeftLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>
            <mesh position={[-bodyW / 2 - 0.01, bodyH / 2 + 0.1, bodyD / 2 - 0.8]}>
                <boxGeometry args={[0.05, 0.1, 0.2]} />
                <meshStandardMaterial ref={sideRightLight} color="#554433" emissive="#ff6600" emissiveIntensity={0} />
            </mesh>

            {/* 
              -------------------------------------------------------------
              [ HTML Labels (UIオーバレイ表示) ]
              3D空間上にReactコンポーネント(HTML)をマッピングする機能(@react-three/drei の Html)を使用。
              サンキューハザード時やレーンチェンジ時にポップアップを表示します。
              -------------------------------------------------------------
            */}
            {hazard && (
                <Html position={[0, roofY + 0.8, 0]} center zIndexRange={[100, 0]}>
                    <div className="text-pink-400 font-bold text-lg tracking-widest uppercase animate-bounce drop-shadow-[0_0_10px_pink] text-center bg-white/90 backdrop-blur px-4 py-1 rounded-full shadow-xl whitespace-nowrap">
                        ♥ THANKYU ♥
                    </div>
                </Html>
            )}
            {!hazard && (leftSig || rightSig) && (
                <Html position={[0, roofY + 0.8, 0]} center zIndexRange={[100, 0]}>
                    <div className="text-amber-500 font-black text-lg tracking-widest uppercase animate-pulse drop-shadow-[0_0_10px_orange] text-center bg-white/90 backdrop-blur px-4 py-1 rounded-full shadow-xl whitespace-nowrap">
                        LANE CHANGE
                    </div>
                </Html>
            )}
        </group>
    );
}
