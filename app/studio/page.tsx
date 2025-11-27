// app/studio/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Capture = {
  url: string;
  createdAt: number;
};

export default function StudioPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [ready, setReady] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1) 웹캠 켜기
  useEffect(() => {
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        setErrorMsg(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" }, // 전면 카메라
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setReady(true);
          };
        }
      } catch (e) {
        console.error(e);
        setErrorMsg("카메라에 접근할 수 없습니다. 권한을 확인하세요.");
      }
    };

    start();

    // cleanup: 페이지 떠날 때 스트림 끄기
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // 2) 비디오 → 캔버스 렌더 루프
  useEffect(() => {
    if (!ready || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const render = () => {
      frameId = requestAnimationFrame(render);

      if (video.readyState < 2) return; // 메타데이터 준비 안 됐으면 스킵

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // 캔버스 사이즈를 비디오에 맞춤
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      // 1. 먼저 원본 비디오 프레임 그리기
      ctx.drawImage(video, 0, 0, vw, vh);

      // 2. 나중에 여기 위에 눈썹/템플릿/오버레이 그릴 예정
      //    예: drawEyebrow(ctx, landmarks, style);
    };

    render();

    return () => cancelAnimationFrame(frameId);
  }, [ready]);

  // 3) 캡처 버튼
  const handleCapture = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    setCaptures((prev) => [{ url, createdAt: Date.now() }, ...prev]);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center py-8 px-4">
      <h1 className="text-xl md:text-2xl font-semibold mb-2">
        반영구 눈썹 시뮬레이터 – 스튜디오 MVP
      </h1>
      <p className="text-sm text-white/70 mb-4">
        1단계: 웹캠 + 캡처까지. 다음 단계에서 눈썹 템플릿/AI 합성 붙이면 됨.
      </p>

      {errorMsg && (
        <div className="mb-3 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {errorMsg}
        </div>
      )}

      {/* 비디오 엘리먼트는 숨겨두고, 캔버스만 사용자에게 노출 */}
      <video ref={videoRef} className="hidden" playsInline />

      <div className="w-full max-w-md aspect-[3/4] rounded-xl overflow-hidden border border-white/15 bg-black flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <button
        onClick={handleCapture}
        disabled={!ready}
        className="mt-4 px-4 py-2 rounded-md bg-emerald-500 text-sm font-medium disabled:bg-gray-600"
      >
        {ready ? "현재 화면 캡처" : "카메라 준비 중..."}
      </button>

      {captures.length > 0 && (
        <section className="mt-6 w-full max-w-md">
          <h2 className="text-sm font-medium mb-2 text-white/80">
            캡처 이미지
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {captures.map((c) => (
              <div key={c.createdAt} className="border border-white/10 rounded-md overflow-hidden">
                <img src={c.url} alt="capture" className="w-full h-auto" />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
