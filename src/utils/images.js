const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2200;
const KEEP_ORIGINAL_BYTES = 2.5 * 1024 * 1024;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("这张图片暂时无法读取，换一张试试吧。"));
    };
    image.src = url;
  });
}

function fileNameWithoutExtension(name) {
  return (name || "照片").replace(/\.[^.]+$/, "").slice(0, 80) || "照片";
}

export async function prepareImageForUpload(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    throw new Error("没有读到这张图片。");
  }

  const type = file.type || "";
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("只支持 JPG、PNG、WEBP 或 GIF 图片。");
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("原图太大了，请选一张小于 20MB 的图片。");
  }

  // Keep GIF animation files as-is; the server limit is 10MB.
  if (type === "image/gif") {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("GIF 图片需要小于 10MB。");
    }
    return {
      blob: file,
      name: file.name || "照片.gif",
    };
  }

  let source;
  let width;
  let height;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const image = await loadImageElement(file);
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

    if (scale === 1 && file.size <= KEEP_ORIGINAL_BYTES) {
      return {
        blob: file,
        name: file.name || `照片.${type.split("/")[1] || "jpg"}`,
      };
    }

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器暂时无法处理图片。");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.84);
    });

    if (!blob) throw new Error("图片压缩失败，请换一张试试。");

    return {
      blob,
      name: `${fileNameWithoutExtension(file.name)}.webp`,
    };
  } finally {
    if (typeof source?.close === "function") source.close();
  }
}
