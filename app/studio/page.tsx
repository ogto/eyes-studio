// app/studio/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

type Capture = {
  url: string;
  createdAt: number;
};

type EyebrowStyle = {
  id: string;
  name: string;
  color: string;   // rgba 또는 hex
  thickness: number; // 두께(1 ~ 3 정도)
  offsetY: number;   // y축 오프셋 (음수면 약간 위로 올라감)
};

export default function StudioPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [cameraReady, setCameraReady] = useState(false);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 👉 눈썹 템플릿 목록
  const [styles] = useState<EyebrowStyle[]>([
    {
      id: "natural",
      name: "내추럴",
      color: "rgba(60, 40, 30, 0.75)",
      thickness: 1.0,
      offsetY: 0.0,
    },
    {
      id: "soft-flat",
      name: "소프트 일자",
      color: "rgba(45, 35, 28, 0.82)",
      thickness: 1.3,
      offsetY: -0.003,
    },
    {
      id: "flat",
      name: "선명 일자",
      color: "rgba(30, 22, 18, 0.88)",
      thickness: 1.6,
      offsetY: -0.006,
    },
    {
      id: "arch",
      name: "아치",
      color: "rgba(55, 35, 25, 0.85)",
      thickness: 1.4,
      offsetY: -0.01,
    },
    {
      id: "strong-arch",
      name: "강한 아치",
      color: "rgba(25, 18, 14, 0.9)",
      thickness: 1.9,
      offsetY: -0.014,
    },
  ]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("natural");

  // 1) 카메라 켜기
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setErrorMsg(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setCameraReady(true);
          };
        }
      } catch (e) {
        console.error(e);
        setErrorMsg("카메라에 접근할 수 없습니다. 브라우저 권한을 확인하세요.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // 2) MediaPipe Face Landmarker 초기화
  useEffect(() => {
    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          numFaces: 1,
          runningMode: "VIDEO",
        });

        landmarkerRef.current = landmarker;
        setLandmarkerReady(true);
      } catch (e) {
        console.error(e);
        setErrorMsg("얼굴 인식 모델을 불러오지 못했습니다.");
      }
    };

    initLandmarker();
  }, []);

  // 3) 비디오 → 캔버스 렌더 + 눈썹 오버레이
  useEffect(() => {
    if (!cameraReady || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const render = async () => {
      frameId = requestAnimationFrame(render);

      if (video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      // 1. 원본 프레임
      ctx.drawImage(video, 0, 0, vw, vh);

      // 2. 얼굴 랜드마크 추론
      if (!landmarkerRef.current || !landmarkerReady) return;

      const nowInMs = performance.now();
      if (lastVideoTimeRef.current === nowInMs) return;
      lastVideoTimeRef.current = nowInMs;

      const result: FaceLandmarkerResult =
        landmarkerRef.current.detectForVideo(video, nowInMs);

      if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

      const landmarks = result.faceLandmarks[0];
      const style =
        styles.find((s) => s.id === selectedStyleId) ?? styles[0];

      // 3. 현재 선택된 스타일로 눈썹 그리기
      drawEyebrows(ctx, landmarks, style);
    };

    render();

    return () => cancelAnimationFrame(frameId);
  }, [cameraReady, landmarkerReady, selectedStyleId, styles]);

  // 4) 캡처
  const handleCapture = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    setCaptures((prev) => [{ url, createdAt: Date.now() }, ...prev]);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center py-8 px-4">
      <h1 className="text-xl md:text-2xl font-semibold mb-1">
        반영구 눈썹 시뮬레이터 – 스튜디오 MVP
      </h1>
      <p className="text-sm text-white/65 mb-4">
        실시간 카메라 + 템플릿 선택으로 바로 스타일 비교.
      </p>

      {errorMsg && (
        <div className="mb-3 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {errorMsg}
        </div>
      )}

      <video ref={videoRef} className="hidden" playsInline />

      <div className="w-full max-w-md aspect-[3/4] rounded-xl overflow-hidden border border-white/15 bg-black flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* 👉 템플릿 선택 패널 */}
      <section className="mt-4 w-full max-w-md">
        <h2 className="text-xs font-medium text-white/60 mb-2">
          눈썹 템플릿 선택
        </h2>
        <div className="flex flex-wrap gap-2">
          {styles.map((style) => (
            <button
              key={style.id}
              onClick={() => setSelectedStyleId(style.id)}
              className={`px-3 py-1.5 rounded-full text-xs border transition
              ${
                selectedStyleId === style.id
                  ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                  : "border-white/20 bg-white/5 text-white/80"
              }`}
            >
              {style.name}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={handleCapture}
        disabled={!cameraReady}
        className="mt-4 px-4 py-2 rounded-md bg-emerald-500 text-sm font-medium disabled:bg-gray-600"
      >
        {cameraReady ? "현재 화면 캡처" : "카메라 준비 중..."}
      </button>

      <p className="mt-2 text-xs text-white/50">
        얼굴 인식 모델: {landmarkerReady ? "로드 완료" : "로딩 중..."}
      </p>

      {captures.length > 0 && (
        <section className="mt-6 w-full max-w-md">
          <h2 className="text-sm font-medium mb-2 text-white/80">
            캡처 이미지
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {captures.map((c) => (
              <div
                key={c.createdAt}
                className="border border-white/10 rounded-md overflow-hidden"
              >
                <img src={c.url} alt="capture" className="w-full h-auto" />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/** ===== 눈썹 그리기 유틸 ===== */

/** ===== 눈썹 그리기 유틸 (자연스럽게 리뉴얼) ===== */

// 대략적인 MediaPipe FaceMesh 인덱스 (양쪽 눈썹 라인)
const LEFT_EYEBROW = [52, 65, 55, 107, 66, 105, 63, 70, 156];
const RIGHT_EYEBROW = [282, 295, 285, 336, 296, 334, 293, 300, 383];

// 스타일별 아치 강도 설정
function getArchStrength(styleId: string): number {
  switch (styleId) {
    case "natural":
      return 0.0;    // 거의 일자
    case "soft-flat":
      return 0.003;  // 아주 살짝
    case "flat":
      return 0.0015; // 거의 평평
    case "arch":
      return 0.007;  // 기본 아치
    case "strong-arch":
      return 0.011;  // 강한 아치
    default:
      return 0.003;
  }
}

function drawEyebrows(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number; z?: number }[],
  style: { id: string; color: string; thickness: number; offsetY: number }
) {
  drawOneSide(ctx, landmarks, LEFT_EYEBROW, style, "L");
  drawOneSide(ctx, landmarks, RIGHT_EYEBROW, style, "R");
}

function drawOneSide(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  indices: number[],
  style: { id: string; color: string; thickness: number; offsetY: number },
  side: "L" | "R"
) {
  if (!indices.length) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // 기본 두께 (얼굴 크기 기준) + 스타일별 가중치
  const baseWidth = h * 0.012; // 대략 1.2% 정도
  const lineWidth = baseWidth * style.thickness;

  const archStrength = getArchStrength(style.id); // 아치 강도
  const offsetYpx = style.offsetY * h;            // 스타일별 전체 y 오프셋

  // 원본 포인트들을 캔버스 좌표로 변환 + 아치 적용
  const points: { x: number; y: number }[] = indices.map((i, idx) => {
    const lm = landmarks[i];
    if (!lm) return { x: 0, y: 0 };

    const t =
      indices.length === 1 ? 0.5 : idx / (indices.length - 1); // 0 ~ 1 구간

    let x = lm.x * w;
    let y = lm.y * h + offsetYpx;

    // 스타일별 아치 적용 (가운데가 가장 많이 올라가도록)
    const arch = -archStrength * h * Math.sin(Math.PI * t);
    y += arch;

    return { x, y };
  });

  // 곡선을 부드럽게 만들기 위해 quadraticCurveTo 사용
  const smoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    // 마지막 포인트까지 마무리
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  };

  ctx.save();

  // 약간 블러를 줘서 테두리가 너무 딱딱하지 않게
  ctx.filter = "blur(0.6px)";
  ctx.strokeStyle = style.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1차 메인 스트로크
  smoothPath(points);
  ctx.stroke();

  // 두께를 조금 더 자연스럽게 만들기 위해,
  // 살짝 위/아래로 한 번씩 더 그려서 “모”가 있는 느낌을 준다.
  const spread = lineWidth * 0.18;

  const shiftedUp = points.map((p) => ({ x: p.x, y: p.y - spread }));
  const shiftedDown = points.map((p) => ({ x: p.x, y: p.y + spread }));

  ctx.globalAlpha = 0.8;
  smoothPath(shiftedUp);
  ctx.stroke();

  ctx.globalAlpha = 0.7;
  smoothPath(shiftedDown);
  ctx.stroke();

  ctx.restore();
}
