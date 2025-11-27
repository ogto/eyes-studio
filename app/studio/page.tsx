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

export default function StudioPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [cameraReady, setCameraReady] = useState(false);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
          // 버전 올라가면 이 경로만 최신으로 교체하면 됨
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

  // 3) 비디오 → 캔버스 렌더 + 얼굴/눈썹 오버레이
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
      // 동일 타임스탬프 중복 호출 방지
      if (lastVideoTimeRef.current === nowInMs) return;
      lastVideoTimeRef.current = nowInMs;

      const result: FaceLandmarkerResult =
        landmarkerRef.current.detectForVideo(video, nowInMs);

      if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

      const landmarks = result.faceLandmarks[0];

      // 3. 눈썹 오버레이
      drawEyebrows(ctx, landmarks);
    };

    render();

    return () => cancelAnimationFrame(frameId);
  }, [cameraReady, landmarkerReady]);

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
        웹캠 + 얼굴 인식 + 눈썹 영역 오버레이까지 붙인 최소 기능 버전.
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

      <button
        onClick={handleCapture}
        disabled={!cameraReady}
        className="mt-4 px-4 py-2 rounded-md bg-emerald-500 text-sm font-medium disabled:bg-gray-600"
      >
        {cameraReady ? "현재 화면 캡처" : "카메라 준비 중..."}
      </button>

      <p className="mt-2 text-xs text-white/50">
        얼굴 인식 모델 상태: {landmarkerReady ? "로드 완료" : "로딩 중..."}
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

/**
 * 눈썹 인덱스는 MediaPipe FaceMesh 기준 예시다.
 * 실제 인덱스는 얼굴에 맞게 조정해가면서 튜닝해야 한다.
 * (대략적인 영역만 잡는 용도)
 */
const LEFT_EYEBROW = [52, 65, 55, 107, 66, 105, 63, 70, 156];
const RIGHT_EYEBROW = [282, 295, 285, 336, 296, 334, 293, 300, 383];

function drawEyebrows(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number; z?: number }[]
) {
  // 기본 색/투명도는 나중에 스타일 패널로 뺄 예정
  drawOneSide(ctx, landmarks, LEFT_EYEBROW, "rgba(60, 40, 30, 0.8)");
  drawOneSide(ctx, landmarks, RIGHT_EYEBROW, "rgba(60, 40, 30, 0.8)");
}

function drawOneSide(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  indices: number[],
  color: string
) {
  if (!indices.length) return;

  ctx.fillStyle = color;
  ctx.beginPath();

  indices.forEach((i, idx) => {
    const lm = landmarks[i];
    if (!lm) return;
    const x = lm.x * ctx.canvas.width;
    const y = lm.y * ctx.canvas.height;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.closePath();
  ctx.fill();
}
