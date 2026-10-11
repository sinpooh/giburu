/** 写真を小さくして（長い辺 maxPx、JPEG）data URL にする。Firestoreに入れられる大きさにするため */
export async function shrinkImage(file: File, maxPx = 1280, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ng;
      i.src = url;
    });
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let q = quality;
    let out = c.toDataURL("image/jpeg", q);
    while (out.length > 600_000 && q > 0.35) out = c.toDataURL("image/jpeg", (q -= 0.12));
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
